import { vi } from 'vitest';
import type { VoiceConnection, VoiceTransport, VoiceTransportEvent } from '../src/index.js';

export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function createTransportHarness() {
  const sessions: Array<{ connection: VoiceConnection; emit(event: VoiceTransportEvent): Promise<void>; signal: AbortSignal }> = [];
  const transport: VoiceTransport = {
    async connect(options) {
      const connection: VoiceConnection = {
        requestResponse: vi.fn(() => true), sendToolResult: vi.fn(() => true),
        replaceContext: vi.fn(async () => undefined), publishEvent: vi.fn(async () => undefined),
        close: vi.fn(),
      };
      sessions.push({ connection, emit: options.emit, signal: options.signal });
      await options.emit({ type: 'ready' });
      return connection;
    },
  };
  return { transport, sessions, get current() { return sessions.at(-1)!; } };
}
