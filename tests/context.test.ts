import { describe, expect, it } from 'vitest';
import { createContextBroker } from '../src/context-broker.js';
import { deferred } from './harness.js';

describe('context snapshots', () => {
  it('detects mutations even when an application reuses its state object', async () => {
    const state = { scale: 1 }, broker = createContextBroker([{ key: 'state', snapshot: () => state }]);
    const signal = new AbortController().signal;
    await broker.capture(signal); state.scale = 2;
    expect((await broker.capture(signal))?.sources).toEqual({ state: { scale: 2 } });
    expect(await broker.capture(signal)).toBeNull();
  });
  it('keeps dirtiness marked during an asynchronous capture', async () => {
    const value = deferred<unknown>(), broker = createContextBroker([{ key: 'state', snapshot: () => value.promise }]);
    const signal = new AbortController().signal, capture = broker.capture(signal);
    broker.markDirty('state'); value.resolve({ scale: 2 }); await capture;
    expect(await broker.capture(signal)).not.toBeNull();
  });
  it('lets applications define materiality without losing current values', async () => {
    let value = 0;
    const broker = createContextBroker([{ key: 'distance', snapshot: () => value, hasMateriallyChanged: (a, b) => Math.abs(Number(a) - Number(b)) >= 10 }]);
    const signal = new AbortController().signal; await broker.capture(signal);
    value = 2; expect(await broker.capture(signal)).toBeNull();
    value = 12; expect((await broker.capture(signal))?.sources.distance).toBe(12);
  });
});
