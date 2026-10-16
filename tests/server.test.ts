import { describe, expect, it, vi } from 'vitest';
import { createOpenAIVoiceSessionHandler } from '../src/server/openai/index.js';

const tools = [{ name: 'read', description: 'Read current state', parameters: { type: 'object' } }];
const profile = { configuration: { session: { type: 'realtime', model: 'fixture-model', audio: { input: { turn_detection: { type: 'server_vad' } } } } }, tools };
const request = (profile = 'example', method = 'POST') => new Request(`https://site.test/api/voice?profile=${profile}`, { method });
function fixture() {
  const fetcher = vi.fn(async () => Response.json({ value: 'ephemeral' }));
  return { fetcher, handle: createOpenAIVoiceSessionHandler({ apiKey: 'server-only-fixture', profiles: { example: profile }, authorize: () => true, fetch: fetcher }) };
}
describe('trusted voice sessions', () => {
  it('selects approved profiles and returns their exact client contract', async () => {
    const { handle, fetcher } = fixture(); const response = await handle(request());
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ value: 'ephemeral', voiceOs: { profile: 'example', contractVersion: 1, tools } });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer server-only-fixture' });
    expect(JSON.parse(String(init.body)).session.tools).toEqual([{ type: 'function', ...tools[0] }]);
  });
  it('rejects unknown and prototype profiles without contacting the provider', async () => {
    const { handle, fetcher } = fixture();
    expect((await handle(request('unknown'))).status).toBe(400);
    expect((await handle(request('toString'))).status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
  });
  it('honors host denial before requesting credentials', async () => {
    const fetcher = vi.fn(), handle = createOpenAIVoiceSessionHandler({ profiles: { example: profile }, authorize: () => false, fetch: fetcher });
    expect((await handle(request())).status).toBe(403); expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not fall back when an explicit profile resolver rejects a selection', async () => {
    const handle = createOpenAIVoiceSessionHandler({ profiles: { example: profile }, authorize: () => true, resolveProfile: () => null });
    expect((await handle(request())).status).toBe(400);
  });
  it('supports coordinated turns without disabling interruption', async () => {
    const fetcher = vi.fn(async () => Response.json({ value: 'ephemeral' }));
    const handle = createOpenAIVoiceSessionHandler({ apiKey: 'fixture', profiles: { example: { ...profile, turnMode: 'coordinated' } }, authorize: () => true, fetch: fetcher });
    await handle(request()); const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).session.audio.input.turn_detection).toMatchObject({ create_response: false, interrupt_response: true });
  });
  it('sanitizes upstream failures and distinguishes missing host configuration', async () => {
    const missing = createOpenAIVoiceSessionHandler({ profiles: { example: profile }, authorize: () => true });
    expect((await missing(request())).status).toBe(503);
    const failing = createOpenAIVoiceSessionHandler({ apiKey: 'fixture', profiles: { example: profile }, authorize: () => true,
      fetch: async () => { throw new Error('sensitive upstream details'); } });
    expect(await (await failing(request())).text()).not.toContain('sensitive');
    expect((await failing(request('example', 'GET'))).status).toBe(405);
  });
});
