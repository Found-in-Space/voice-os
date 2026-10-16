import { describe, expect, it, vi } from 'vitest';
import { createOpenAIRealtimeTransport, type OpenAIRealtimeTransportOptions } from '../src/transports/openai-realtime/index.js';
import type { VoiceTransportEvent } from '../src/index.js';
import { deferred } from './harness.js';

class Channel extends EventTarget {
  readyState: RTCDataChannelState = 'open';
  sent: Array<Record<string, unknown>> = [];
  send(value: string) { this.sent.push(JSON.parse(value) as Record<string, unknown>); }
  close = vi.fn(() => { this.readyState = 'closed'; this.dispatchEvent(new Event('close')); });
  message(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
}
class Peer extends EventTarget {
  channel = new Channel(); connectionState = 'connected';
  close = vi.fn(); addTrack = vi.fn(); setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => undefined);
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'fixture offer' }));
  createDataChannel() { return this.channel as unknown as RTCDataChannel; }
}
function microphone() {
  const track = { stop: vi.fn(), getSettings: () => ({ echoCancellation: true }) };
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream };
}
function fixture(overrides: Partial<OpenAIRealtimeTransportOptions> = {}) {
  const mic = microphone(), peer = new Peer(), abort = new AbortController();
  const events: VoiceTransportEvent[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes('realtime/calls')
    ? new Response('fixture answer') : Response.json({ value: 'ephemeral fixture' }));
  const options: OpenAIRealtimeTransportOptions = { sessionEndpoint: '/api/voice', getUserMedia: async () => mic.stream,
    createPeerConnection: () => peer as unknown as RTCPeerConnection, fetch: fetcher, onRemoteStream: vi.fn(), ...overrides };
  const transport = createOpenAIRealtimeTransport(options);
  const context = { signal: abort.signal, tools: [], turnMode: 'automatic' as const, emit: async (event: VoiceTransportEvent) => { events.push(event); } };
  return { mic, peer, abort, events, fetcher, transport, context };
}

describe('OpenAI browser transport ownership', () => {
  it('does not acquire media until connected and closes owned tracks', async () => {
    const acquire = vi.fn(async () => microphone().stream), f = fixture({ getUserMedia: acquire });
    expect(acquire).not.toHaveBeenCalled(); const c = await f.transport.connect(f.context);
    expect(acquire).toHaveBeenCalledOnce(); c.close(); expect(f.peer.close).toHaveBeenCalledOnce();
  });
  it('stops a late microphone after token acquisition has failed', async () => {
    const late = deferred<MediaStream>(), mic = microphone();
    const f = fixture({ getUserMedia: () => late.promise, fetch: async () => new Response('denied', { status: 503 }) });
    await expect(f.transport.connect(f.context)).rejects.toThrow('503');
    late.resolve(mic.stream); await Promise.resolve(); await Promise.resolve();
    expect(mic.track.stop).toHaveBeenCalledOnce();
  });
  it('stops a late microphone after disable, even when fetch ignores cancellation', async () => {
    const late = deferred<MediaStream>(), mic = microphone();
    const f = fixture({ getUserMedia: () => late.promise });
    const pending = f.transport.connect(f.context); f.abort.abort(); late.resolve(mic.stream);
    await expect(pending).rejects.toThrow(); expect(mic.track.stop).toHaveBeenCalledOnce();
  });
  it('cannot finish obsolete negotiation after cancellation', async () => {
    const f = fixture(), offer = deferred<{ type: 'offer'; sdp: string }>(); f.peer.createOffer.mockImplementation(() => offer.promise);
    const pending = f.transport.connect(f.context); await vi.waitFor(() => expect(f.peer.createOffer).toHaveBeenCalled());
    f.abort.abort(); offer.resolve({ type: 'offer', sdp: 'old offer' });
    await expect(pending).rejects.toThrow(); expect(f.peer.setRemoteDescription).not.toHaveBeenCalled();
    expect(f.mic.track.stop).toHaveBeenCalledOnce();
  });
  it('rejects mismatched schemas before negotiating a connection', async () => {
    const f = fixture();
    await expect(f.transport.connect({ ...f.context, tools: [{ name: 'read', description: '', parameters: { type: 'object' } }] })).rejects.toThrow('contract');
    expect(f.peer.createOffer).not.toHaveBeenCalled(); expect(f.mic.track.stop).toHaveBeenCalledOnce();
  });
  it('keeps the full credential out of the browser handshake', async () => {
    const f = fixture(); const c = await f.transport.connect(f.context);
    expect(f.fetcher.mock.calls[0]?.[0]).toBe('/api/voice');
    const fetchCalls = vi.mocked(f.fetcher).mock.calls as unknown as Array<[string, RequestInit]>;
    expect(fetchCalls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer ephemeral fixture' }); c.close();
  });
  it('rejects server tools that have no matching client handlers', async () => {
    const f = fixture({ fetch: async () => Response.json({ value: 'ephemeral fixture', voiceOs: {
      contractVersion: 1, tools: [{ name: 'undeclared', parameters: { type: 'object' } }], turnMode: 'automatic',
    } }) });
    await expect(f.transport.connect(f.context)).rejects.toThrow('contract');
    expect(f.peer.createOffer).not.toHaveBeenCalled();
  });
  it('requires a matching server turn policy for coordinated inference', async () => {
    const f = fixture();
    await expect(f.transport.connect({ ...f.context, turnMode: 'coordinated' })).rejects.toThrow('turn policy');
    expect(f.peer.createOffer).not.toHaveBeenCalled();
  });
});

describe('OpenAI protocol translation', () => {
  it('normalizes response identities, completed calls and buffered playback', async () => {
    const f = fixture(), c = await f.transport.connect(f.context);
    f.peer.channel.message({ type: 'response.created', response: { id: 'r1' } });
    f.peer.channel.message({ type: 'response.done', response: { id: 'r1', status: 'completed', output: [{ type: 'function_call', name: 'read', arguments: '{}', call_id: 'c1' }] } });
    f.peer.channel.message({ type: 'output_audio_buffer.started' });
    await vi.waitFor(() => expect(f.events).toHaveLength(3));
    expect(f.events[1]).toEqual({ type: 'response-done', id: 'r1', status: 'completed', error: undefined, calls: [{ name: 'read', arguments: '{}', id: 'c1' }] }); c.close();
  });
  it('awaits correlated context insertion and replaces only its previous state item', async () => {
    const f = fixture(), c = await f.transport.connect(f.context);
    let acked = false;
    const first = c.replaceContext({ version: 1, capturedAt: 'now', sources: { view: 1 } }, f.abort.signal).then(() => { acked = true; });
    await vi.waitFor(() => expect(f.peer.channel.sent).toHaveLength(1)); expect(acked).toBe(false);
    f.peer.channel.message({ type: 'conversation.item.done', item: { id: 'unrelated' } }); await Promise.resolve(); expect(acked).toBe(false);
    f.peer.channel.message({ type: 'conversation.item.done', item: { id: 'voice_item_1' } }); await first;
    const second = c.replaceContext({ version: 2, capturedAt: 'now', sources: { view: 2 } }, f.abort.signal);
    await vi.waitFor(() => expect(f.peer.channel.sent).toHaveLength(2));
    f.peer.channel.message({ type: 'conversation.item.done', item: { id: 'voice_item_2' } }); await second;
    expect(f.peer.channel.sent.at(-1)).toEqual({ type: 'conversation.item.delete', item_id: 'voice_item_1' }); c.close();
  });
  it('settles acknowledgement waiters when the session closes', async () => {
    const f = fixture(), c = await f.transport.connect(f.context);
    const pending = c.replaceContext({ version: 1, capturedAt: 'now', sources: {} }, f.abort.signal);
    await vi.waitFor(() => expect(f.peer.channel.sent).toHaveLength(1)); c.close();
    await expect(pending).rejects.toThrow('closed');
  });
  it('constructs a remote stream for implementations that omit event.streams', async () => {
    const remote = microphone().stream, sink = vi.fn();
    const f = fixture({ createMediaStream: () => remote, onRemoteStream: sink });
    const c = await f.transport.connect(f.context);
    f.peer.dispatchEvent(Object.assign(new Event('track'), { streams: [], track: {} }));
    expect(sink).toHaveBeenCalledWith(remote); c.close(); expect(sink).toHaveBeenLastCalledWith(null);
  });
});
