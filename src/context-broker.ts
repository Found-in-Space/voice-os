import type { VoiceContextSnapshot, VoiceStateSource } from './types.js';
export function createContextBroker(sources: readonly VoiceStateSource[]) {
    const names = new Set(sources.map(source => source.key));
    if (names.size !== sources.length)
        throw new Error('Duplicate voice state source.');
    const previous = new Map<string, unknown>();
    const dirty = new Map([...names].map(name => [name, 1]));
    let version = 0;
    return {
        get version() { return version; },
        markDirty(key: string) {
            if (!names.has(key))
                throw new Error(`Unknown voice state source: ${key}`);
            dirty.set(key, (dirty.get(key) ?? 0) + 1);
        },
        invalidate() {
            for (const key of names)
                dirty.set(key, (dirty.get(key) ?? 0) + 1);
        },
        async capture(signal: AbortSignal): Promise<VoiceContextSnapshot | null> {
            if (!sources.length)
                return null;
            const capturedDirty = new Map(dirty);
            const values = await Promise.all(sources.map(async (source) => {
                const value = await source.snapshot(signal);
                return [source.key, JSON.parse(JSON.stringify(value ?? null)) as unknown] as const;
            }));
            signal.throwIfAborted();
            const changed = sources.some(source => {
                const value = values.find(([key]) => key === source.key)![1];
                return dirty.has(source.key) || !previous.has(source.key) ||
                    (source.hasMateriallyChanged ? source.hasMateriallyChanged(previous.get(source.key), value)
                        : JSON.stringify(previous.get(source.key)) !== JSON.stringify(value));
            });
            if (!changed)
                return null;
            for (const [key, value] of values)
                previous.set(key, value);
            for (const [key, version] of capturedDirty)
                if (dirty.get(key) === version)
                    dirty.delete(key);
            return { version: ++version, capturedAt: new Date().toISOString(), sources: Object.fromEntries(values) };
        },
    };
}
