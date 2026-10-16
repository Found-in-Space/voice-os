import { describe, expect, it, vi } from 'vitest';
import { bindVoiceTools, createVoiceRuntime, defineVoiceTool, type VoiceApplicationEvent, type VoiceRuntimeOptions, type VoiceConnection } from '../src/index.js';
import { createTransportHarness, deferred } from './harness.js';

const contract = { name: 'set_scale', description: 'Set the application scale', parameters: {
  type: 'object', properties: { scale: { type: 'number', exclusiveMinimum: 0 } }, required: ['scale'], additionalProperties: false,
} };
async function fixture(extra: Partial<VoiceRuntimeOptions> = {}) {
  const h = createTransportHarness();
  const voice = createVoiceRuntime({ transport: h.transport, ...extra });
  await voice.enable();
  return { h, voice, c: h.current.connection, emit: h.current.emit };
}
const done = (id: string, callId = 'call_1', args = '{"scale":10}') => ({ type: 'response-done' as const, id, status: 'completed', calls: [{ id: callId, name: 'set_scale', arguments: args }] });

describe('VoiceOS lifecycle and commands', () => {
  it('constructs without connecting and isolates instances', async () => {
    const h = createTransportHarness();
    const a = createVoiceRuntime({ transport: h.transport }), b = createVoiceRuntime({ transport: h.transport });
    expect(h.sessions).toHaveLength(0);
    await a.enable(); await b.enable(); a.disable();
    expect(a.active).toBe(false); expect(b.active).toBe(true);
    await a.dispose(); await b.dispose();
  });
  it('disposes owned connections, subscriptions and pending work', async () => {
    const { voice, c, h, emit } = await fixture();
    const listener = vi.fn(); voice.subscribe(listener);
    await voice.dispose(); const count = listener.mock.calls.length;
    expect(h.current.signal.aborted).toBe(true); expect(c.close).toHaveBeenCalledOnce();
    await emit({ type: 'response-start', id: 'late' });
    expect(listener).toHaveBeenCalledTimes(count);
    await expect(voice.enable()).rejects.toThrow('disposed');
  });
  it('closes a late successful connection without disturbing its successor', async () => {
    const h = createTransportHarness(), pending = deferred<VoiceConnection>();
    let first = true;
    const voice = createVoiceRuntime({ transport: { connect(options) { if (first) { first = false; return pending.promise; } return h.transport.connect(options); } } });
    const older = voice.enable(); voice.disable(); await voice.enable();
    const obsolete = { ...h.current.connection, close: vi.fn() };
    pending.resolve(obsolete); await older; await Promise.resolve();
    expect(obsolete.close).toHaveBeenCalledOnce(); expect(voice.active).toBe(true);
    await voice.dispose();
  });
  it('validates tool arguments before calling application commands', async () => {
    const execute = vi.fn(value => value);
    const { c, emit, voice } = await fixture({ tools: bindVoiceTools([contract], { set_scale: execute }) });
    await emit(done('r1', 'bad', '{"scale":-1}'));
    expect(execute).not.toHaveBeenCalled();
    expect(c.sendToolResult).toHaveBeenCalledWith('bad', expect.objectContaining({ error: expect.objectContaining({ code: 'invalid_arguments' }) }));
    await voice.dispose();
  });
  it('returns committed results and deduplicates calls', async () => {
    const execute = vi.fn(() => ({ applied: true, scale: 10 }));
    const { c, emit, voice } = await fixture({ tools: bindVoiceTools([contract], { set_scale: execute }) });
    await emit(done('r1')); await emit(done('r1')); await emit(done('r2'));
    expect(execute).toHaveBeenCalledOnce(); expect(c.sendToolResult).toHaveBeenCalledOnce();
    expect(c.sendToolResult).toHaveBeenCalledWith('call_1', { applied: true, scale: 10 });
    await voice.dispose();
  });
  it('rejects absent and undeclared tool bindings', () => {
    expect(() => bindVoiceTools([contract], {})).toThrow('Missing');
    expect(() => bindVoiceTools([], { extra: () => null })).toThrow('Undeclared');
  });
  it('supports typed schema declarations', async () => {
    const tool = defineVoiceTool<{ scale: number }>({ name: 'set_scale', description: 'Scale',
      parameters: { type: 'object', properties: { scale: { type: 'number' } }, required: ['scale'], additionalProperties: false },
      execute: args => ({ applied: args.scale }),
    });
    const { emit, c, voice } = await fixture({ tools: [tool] });
    await emit(done('r')); expect(c.sendToolResult).toHaveBeenCalledWith('call_1', { applied: 10 }); await voice.dispose();
  });
  it('keeps late tool results out of a replacement session', async () => {
    const result = deferred<unknown>();
    const { h, voice, emit, c } = await fixture({ tools: bindVoiceTools([contract], { set_scale: () => result.promise }) });
    const pending = emit(done('old')); await Promise.resolve();
    voice.disable(); await voice.enable(); result.resolve({ applied: true }); await pending;
    expect(c.sendToolResult).not.toHaveBeenCalled(); expect(h.current.connection.sendToolResult).not.toHaveBeenCalled();
    await voice.dispose();
  });
  it('does not execute calls from cancelled responses', async () => {
    const execute = vi.fn(); const { emit, voice } = await fixture({ tools: bindVoiceTools([contract], { set_scale: execute }) });
    await emit({ ...done('r'), status: 'cancelled' }); expect(execute).not.toHaveBeenCalled(); await voice.dispose();
  });
  it('does not request a continuation when the tool output could not be sent', async () => {
    const { emit, c, voice } = await fixture({ tools: bindVoiceTools([contract], { set_scale: () => ({ applied: true }) }) });
    vi.mocked(c.sendToolResult).mockReturnValue(false);
    await emit(done('r'));
    expect(c.requestResponse).not.toHaveBeenCalled();
    expect(voice.getSnapshot()).toMatchObject({ state: 'error', error: expect.stringContaining('tool result') });
    await voice.dispose();
  });
});

describe('turn coordination and playback', () => {
  it('answers a turn committed during initial context upload instead of greeting over it', async () => {
    const h = createTransportHarness(), ack = deferred<void>();
    const voice = createVoiceRuntime({
      transport: { async connect(options) {
        const connection = await h.transport.connect(options);
        vi.mocked(connection.replaceContext).mockImplementationOnce(() => ack.promise);
        return connection;
      } }, turnMode: 'coordinated', greetingInstructions: 'Hello',
      stateSources: [{ key: 'view', snapshot: () => ({ scale: 1 }) }],
    });
    const enabling = voice.enable();
    await vi.waitFor(() => expect(h.current.connection.replaceContext).toHaveBeenCalledOnce());
    await h.current.emit({ type: 'speech-start' }); await h.current.emit({ type: 'speech-stop' });
    await h.current.emit({ type: 'user-turn-committed' });
    ack.resolve(); await enabling;
    expect(h.current.connection.requestResponse).toHaveBeenCalledExactlyOnceWith();
    await voice.dispose();
  });
  it('serializes a tool continuation behind an automatic VAD response', async () => {
    const result = deferred<unknown>();
    const { emit, c, voice } = await fixture({ tools: bindVoiceTools([contract], { set_scale: () => result.promise }) });
    await emit({ type: 'response-start', id: 'r1' }); const tool = emit(done('r1'));
    await emit({ type: 'speech-start' }); await emit({ type: 'speech-stop' }); await emit({ type: 'response-start', id: 'r2' });
    result.resolve({ applied: true }); await tool; expect(c.requestResponse).not.toHaveBeenCalled();
    await emit({ type: 'response-done', id: 'r2', status: 'completed', calls: [] });
    expect(c.requestResponse).toHaveBeenCalledOnce(); await voice.dispose();
  });
  it('waits for buffered playback to end before exposing errors', async () => {
    const { emit, voice } = await fixture();
    await emit({ type: 'playback-start' });
    await emit({ type: 'response-done', id: 'r', status: 'incomplete', error: 'early', calls: [] });
    expect(voice.getSnapshot().state).toBe('speaking'); await emit({ type: 'playback-stop' });
    expect(voice.getSnapshot()).toMatchObject({ state: 'error', error: 'early' }); await voice.dispose();
  });
  it('preserves protocol errors through response completion and playback', async () => {
    const { emit, voice } = await fixture();
    await emit({ type: 'playback-start' }); await emit({ type: 'error', message: 'transport failed' });
    await emit({ type: 'response-done', id: 'r', status: 'completed', calls: [] }); await emit({ type: 'playback-stop' });
    expect(voice.getSnapshot().error).toBe('transport failed'); await voice.dispose();
  });
  it('does not overwrite active user speech when playback is cleared', async () => {
    const { emit, voice } = await fixture();
    await emit({ type: 'playback-start' }); await emit({ type: 'speech-start' }); await emit({ type: 'playback-stop' });
    expect(voice.getSnapshot()).toMatchObject({ state: 'listening', reason: 'hearing' }); await voice.dispose();
  });
  it('captures fresh state and awaits its acknowledgement before inference', async () => {
    let scale = 1; const { emit, voice, c } = await fixture({ turnMode: 'coordinated', stateSources: [{ key: 'view', snapshot: () => ({ scale }) }] });
    const ack = deferred<void>(); vi.mocked(c.replaceContext).mockImplementationOnce(() => ack.promise);
    scale = 2; await emit({ type: 'speech-start' }); await emit({ type: 'speech-stop' });
    const turn = emit({ type: 'user-turn-committed' }); await Promise.resolve(); await Promise.resolve();
    expect(c.requestResponse).not.toHaveBeenCalled(); ack.resolve(); await turn;
    expect(c.replaceContext).toHaveBeenLastCalledWith(expect.objectContaining({ sources: { view: { scale: 2 } } }), expect.any(AbortSignal));
    expect(c.requestResponse).toHaveBeenCalledOnce(); await voice.dispose();
  });
  it('does not answer an obsolete turn when speech resumes during capture', async () => {
    const capture = deferred<unknown>(); let calls = 0;
    const { emit, voice, c } = await fixture({ turnMode: 'coordinated', stateSources: [{ key: 'view', snapshot: () => ++calls === 1 ? 1 : capture.promise }] });
    const turn = emit({ type: 'user-turn-committed' }); await Promise.resolve(); await emit({ type: 'speech-start' });
    capture.resolve(2); await turn; expect(c.requestResponse).not.toHaveBeenCalled(); await voice.dispose();
  });
  it('retries unacknowledged context before answering a subsequent turn', async () => {
    let scale = 1;
    const { emit, voice, c } = await fixture({ turnMode: 'coordinated', stateSources: [{ key: 'view', snapshot: () => ({ scale }) }] });
    vi.mocked(c.replaceContext).mockRejectedValueOnce(new Error('context rejected'));
    scale = 2; await emit({ type: 'user-turn-committed' });
    expect(c.requestResponse).not.toHaveBeenCalled();
    await emit({ type: 'user-turn-committed' });
    expect(c.replaceContext).toHaveBeenCalledTimes(3);
    expect(c.replaceContext).toHaveBeenLastCalledWith(expect.objectContaining({ sources: { view: { scale: 2 } } }), expect.any(AbortSignal));
    expect(c.requestResponse).toHaveBeenCalledOnce(); await voice.dispose();
  });
  it('reports blocked playback separately from response activity', async () => {
    const { emit, voice } = await fixture(); await emit({ type: 'playback-blocked' });
    expect(voice.getSnapshot().playback).toBe('blocked'); await voice.dispose();
  });
  it('rechecks playback that starts while a response waits for fresh context', async () => {
    const capture = deferred<unknown>(); let count = 0;
    const { emit, voice, c } = await fixture({ turnMode: 'coordinated', stateSources: [{ key: 'view', snapshot: () => ++count === 1 ? 1 : capture.promise }] });
    const turn = emit({ type: 'user-turn-committed' });
    await vi.waitFor(() => expect(count).toBe(2)); await emit({ type: 'playback-start' });
    capture.resolve(2); await turn;
    expect(c.requestResponse).not.toHaveBeenCalled();
    await emit({ type: 'playback-stop' }); expect(c.requestResponse).toHaveBeenCalledOnce(); await voice.dispose();
  });
});

describe('application events', () => {
  const event: VoiceApplicationEvent = { id: 'e', type: 'arrived', occurredAt: '2026-10-16T00:00:00Z', delivery: 'immediate', speech: 'silent', data: { location: 'home' } };
  it('informs silently and suppresses duplicate and expired events', async () => {
    const { voice, c } = await fixture();
    await voice.publishEvent(event); await voice.publishEvent(event);
    await voice.publishEvent({ ...event, id: 'expired', expiresAt: '2000-01-01T00:00:00Z' });
    expect(c.publishEvent).toHaveBeenCalledOnce(); expect(c.requestResponse).not.toHaveBeenCalled(); await voice.dispose();
  });
  it('does not flush next-turn events until user input commits', async () => {
    const { voice, c, emit } = await fixture({ turnMode: 'coordinated' });
    await voice.publishEvent({ ...event, delivery: 'next-turn' }); expect(c.publishEvent).not.toHaveBeenCalled();
    await emit({ type: 'user-turn-committed' }); expect(c.publishEvent).toHaveBeenCalledOnce(); await voice.dispose();
  });
  it('delivers next-turn events with automatic VAD without requesting a duplicate answer', async () => {
    const { voice, c, emit } = await fixture();
    await voice.publishEvent({ ...event, delivery: 'next-turn' });
    await emit({ type: 'speech-start' }); await emit({ type: 'speech-stop' }); await emit({ type: 'user-turn-committed' });
    expect(c.publishEvent).toHaveBeenCalledOnce(); expect(c.requestResponse).not.toHaveBeenCalled(); await voice.dispose();
  });
  it('allows explicit retry of an event whose delivery failed', async () => {
    const { voice, c } = await fixture();
    vi.mocked(c.publishEvent).mockRejectedValueOnce(new Error('event rejected'));
    await voice.publishEvent(event); await voice.publishEvent(event);
    expect(c.publishEvent).toHaveBeenCalledTimes(2); await voice.dispose();
  });
  it('does not announce a proactive event that expired while playback was busy', async () => {
    vi.useFakeTimers();
    try {
      const { voice, c, emit } = await fixture({ allowProactive: true });
      await emit({ type: 'playback-start' });
      await voice.publishEvent({ ...event, speech: 'proactive', expiresAt: new Date(Date.now() + 100).toISOString() });
      vi.advanceTimersByTime(101); await emit({ type: 'playback-stop' });
      expect(c.requestResponse).not.toHaveBeenCalled(); await voice.dispose();
    } finally { vi.useRealTimers(); }
  });
  it('defers explicitly enabled proactive speech while a user speaks', async () => {
    const { voice, c, emit } = await fixture({ allowProactive: true, turnMode: 'coordinated' });
    await emit({ type: 'speech-start' }); await voice.publishEvent({ ...event, speech: 'proactive' });
    expect(c.requestResponse).not.toHaveBeenCalled(); await emit({ type: 'speech-stop' });
    expect(c.requestResponse).not.toHaveBeenCalled(); await emit({ type: 'user-turn-committed' });
    expect(c.requestResponse).toHaveBeenCalledOnce(); await voice.dispose();
  });
});
