import { createContextBroker } from './context-broker.js';
import { createToolExecutor, errorMessage } from './tools.js';
import type { VoiceApplicationEvent, VoiceConnection, VoiceRuntime, VoiceRuntimeOptions, VoiceSnapshot, VoiceStatus, VoiceTransportEvent } from './types.js';
/** Construct without acquiring media or connecting to any service. */
export function createVoiceRuntime(options: VoiceRuntimeOptions): VoiceRuntime {
    const turnMode = options.turnMode ?? 'automatic';
    const execute = createToolExecutor(options.tools ?? []);
    const listeners = new Set<(snapshot: VoiceSnapshot) => void>();
    let disposed = false;
    let sequence = 0;
    let current: Scope | null = null;
    let status: VoiceStatus = { state: 'off', reason: 'disabled', error: null, playback: 'idle' };
    const closing = new Set<Promise<void>>();
    type Scope = {
        id: number;
        abort: AbortController;
        connection: VoiceConnection | null;
        broker: ReturnType<typeof createContextBroker>;
        responses: Set<string>;
        done: Set<string>;
        calls: Map<string, Promise<unknown>>;
        sentCalls: Set<string>;
        tools: number;
        hearing: boolean;
        playing: boolean;
        pendingResponse: boolean;
        continuation: boolean;
        userTurn: boolean;
        awaitingCommit: boolean;
        ready: boolean;
        initialized: boolean;
        initializing: boolean;
        pumping: boolean;
        revision: number;
        error: string | null;
        events: VoiceApplicationEvent[];
        deliveredEvents: Set<string>;
        proactive: VoiceApplicationEvent[];
    };
    const live = (scope: Scope) => current === scope && !scope.abort.signal.aborted;
    function notify() {
        const snapshot = getSnapshot();
        for (const listener of listeners) listener(snapshot);
    }
    function setStatus(state: VoiceStatus['state'], reason: VoiceStatus['reason'], error: string | null = null) {
        status = { ...status, state, reason, error };
        notify();
    }
    function getSnapshot(): VoiceSnapshot {
        return { ...status, active: current !== null, disposed, sessionId: current?.id ?? null,
            responseCount: current?.responses.size ?? 0, toolCount: current?.tools ?? 0,
            contextVersion: current?.broker.version ?? 0, pendingEvents: current?.events.length ?? 0, turnMode };
    }
    function close(connection: VoiceConnection) {
        const job = Promise.resolve().then(() => connection.close()).then(() => undefined);
        closing.add(job);
        void job.catch(() => undefined).finally(() => closing.delete(job));
    }
    function disable() {
        const previous = current;
        current = null;
        previous?.abort.abort();
        if (previous?.connection)
            close(previous.connection);
        status = { state: 'off', reason: 'disabled', error: null, playback: 'idle' };
        notify();
    }
    async function enable() {
        if (disposed)
            throw new Error('Voice runtime is disposed.');
        if (current)
            return;
        const scope: Scope = { id: ++sequence, abort: new AbortController(), connection: null,
            broker: createContextBroker(options.stateSources ?? []), responses: new Set(), done: new Set(),
            calls: new Map(), sentCalls: new Set(), tools: 0, hearing: false, playing: false, pendingResponse: false,
            continuation: false, userTurn: false, awaitingCommit: false, ready: false, initialized: false, initializing: false, pumping: false,
            revision: 0, error: null, events: [], deliveredEvents: new Set(), proactive: [] };
        current = scope;
        setStatus('connecting', 'connecting');
        try {
            const connection = await options.transport.connect({ signal: scope.abort.signal,
                tools: (options.tools ?? []).map(tool => tool.contract), turnMode,
                emit: event => handle(scope, event) });
            if (!live(scope)) {
                close(connection);
                return;
            }
            scope.connection = connection;
            await initialize(scope);
        }
        catch (error) {
            if (!live(scope))
                return;
            current = null;
            scope.abort.abort();
            if (scope.connection)
                close(scope.connection);
            setStatus('error', 'failure', errorMessage(error));
        }
    }
    async function initialize(scope: Scope) {
        if (!scope.ready || !scope.connection || scope.initialized || scope.initializing || !live(scope))
            return;
        scope.initializing = true;
        try {
            await flushContext(scope);
            if (!live(scope))
                return;
            scope.initialized = true;
            if (options.greetingInstructions && !scope.hearing && !scope.userTurn && !scope.awaitingCommit &&
                !scope.pendingResponse && !scope.responses.size && !scope.playing) {
                scope.pendingResponse = scope.connection.requestResponse(options.greetingInstructions);
                setStatus(scope.pendingResponse ? 'thinking' : 'listening', scope.pendingResponse ? 'greeting' : 'ready');
            }
            else if (scope.hearing)
                setStatus('listening', 'hearing');
            else if (scope.playing)
                setStatus('speaking', 'playback');
            else if (scope.pendingResponse || scope.responses.size || scope.userTurn || scope.awaitingCommit)
                setStatus('thinking', 'response');
            else
                setStatus('listening', 'ready');
        }
        finally {
            scope.initializing = false;
        }
        await pump(scope);
    }
    async function flushContext(scope: Scope) {
        const snapshot = await scope.broker.capture(scope.abort.signal);
        if (snapshot && live(scope)) {
            try {
                await scope.connection!.replaceContext(snapshot, scope.abort.signal);
            }
            catch (error) {
                scope.broker.invalidate();
                throw error;
            }
        }
    }
    async function flushEvents(scope: Scope, immediateOnly = false) {
        for (const event of [...scope.events]) {
            if (!live(scope))
                return;
            if (immediateOnly && event.delivery !== 'immediate')
                continue;
            scope.events = scope.events.filter(item => item !== event);
            if (event.expiresAt && Date.parse(event.expiresAt) <= Date.now())
                continue;
            const key = event.dedupeKey ?? event.id;
            if (scope.deliveredEvents.has(key))
                continue;
            scope.deliveredEvents.add(key);
            try {
                await scope.connection!.publishEvent(event, scope.abort.signal);
            }
            catch (error) {
                scope.deliveredEvents.delete(key);
                throw error;
            }
            if (!live(scope))
                return;
            if (options.allowProactive && event.speech === 'proactive')
                scope.proactive.push(event);
        }
    }
    function fail(scope: Scope, error: unknown) {
        if (!live(scope))
            return;
        scope.error = errorMessage(error);
        if (!scope.playing)
            setStatus('error', 'failure', scope.error);
    }
    function hasProactive(scope: Scope) {
        scope.proactive = scope.proactive.filter(event => !event.expiresAt || Date.parse(event.expiresAt) > Date.now());
        return scope.proactive.length > 0;
    }
    async function pump(scope: Scope) {
        if (!live(scope) || !scope.initialized || !scope.connection || scope.pumping ||
            scope.hearing || scope.awaitingCommit || scope.playing || scope.responses.size || scope.tools || scope.pendingResponse)
            return;
        if (!scope.userTurn && !scope.continuation && !hasProactive(scope) && !scope.events.some(event => event.delivery === 'immediate'))
            return;
        scope.pumping = true;
        const revision = scope.revision;
        try {
            await flushEvents(scope);
            if (!scope.userTurn && !scope.continuation && !hasProactive(scope))
                return;
            await flushContext(scope);
            if (!live(scope) || scope.hearing || scope.awaitingCommit || scope.playing ||
                scope.revision !== revision || scope.responses.size || scope.tools || scope.pendingResponse)
                return;
            if (!scope.userTurn && !scope.continuation && !hasProactive(scope))
                return;
            if (scope.connection.requestResponse()) {
                scope.pendingResponse = true;
                scope.continuation = false;
                scope.userTurn = false;
                scope.proactive = [];
                setStatus('thinking', 'response');
            }
        }
        catch (error) {
            fail(scope, error);
        }
        finally {
            scope.pumping = false;
            if (live(scope) && scope.revision !== revision && scope.userTurn && !scope.hearing)
                void pump(scope);
        }
    }
    async function handle(scope: Scope, event: VoiceTransportEvent): Promise<void> {
        if (!live(scope))
            return;
        switch (event.type) {
            case 'ready':
                scope.ready = true;
                await initialize(scope);
                break;
            case 'speech-start':
                scope.hearing = true;
                scope.revision++;
                scope.userTurn = false;
                scope.awaitingCommit = turnMode === 'coordinated';
                setStatus('listening', 'hearing');
                break;
            case 'speech-stop':
                scope.hearing = false;
                if (turnMode === 'automatic')
                    scope.pendingResponse = true;
                setStatus('thinking', 'response');
                break;
            case 'user-turn-committed':
                scope.awaitingCommit = false;
                if (turnMode === 'coordinated')
                    scope.userTurn = true;
                else if (scope.connection && scope.initialized)
                    await flushEvents(scope);
                break;
            case 'response-start':
                scope.responses.add(event.id);
                scope.pendingResponse = false;
                scope.error = null;
                if (!scope.playing && !scope.hearing)
                    setStatus('thinking', 'response');
                break;
            case 'playback-start':
                scope.playing = true;
                if (status.playback !== 'blocked')
                    status = { ...status, playback: 'playing' };
                if (!scope.hearing)
                    setStatus('speaking', 'playback');
                break;
            case 'playback-blocked':
                status = { ...status, playback: 'blocked' };
                notify();
                break;
            case 'playback-resumed':
                status = { ...status, playback: 'playing' };
                notify();
                break;
            case 'playback-stop':
                scope.playing = false;
                status = { ...status, playback: 'idle' };
                if (scope.error)
                    setStatus('error', 'failure', scope.error);
                else if (!scope.hearing)
                    setStatus(scope.responses.size || scope.tools || scope.pendingResponse ? 'thinking' : 'listening', 'ready');
                break;
            case 'response-done': {
                scope.responses.delete(event.id);
                if (scope.done.has(event.id))
                    break;
                scope.done.add(event.id);
                if (event.status === 'failed' || event.status === 'incomplete')
                    fail(scope, event.error ?? `Voice response ${event.status}.`);
                if (event.status === 'completed' && event.calls.length) {
                    scope.tools++;
                    if (!scope.playing && !scope.hearing)
                        setStatus('thinking', 'tools');
                    try {
                        for (const call of event.calls) {
                            if (!live(scope))
                                return;
                            let work = scope.calls.get(call.id);
                            if (!work) {
                                work = execute(call.name, call.arguments, { signal: scope.abort.signal, sessionId: scope.id, responseId: event.id, callId: call.id });
                                scope.calls.set(call.id, work);
                            }
                            const result = await work;
                            if (!live(scope))
                                return;
                            if (!scope.sentCalls.has(call.id)) {
                                if (!scope.connection!.sendToolResult(call.id, result))
                                    throw new Error('Voice connection could not send a tool result.');
                                scope.sentCalls.add(call.id);
                            }
                        }
                        scope.continuation = true;
                    }
                    catch (error) {
                        fail(scope, error);
                    }
                    finally {
                        scope.tools--;
                    }
                }
                else if (!scope.playing && !scope.hearing && !scope.error && !scope.responses.size && !scope.tools && !scope.pendingResponse)
                    setStatus('listening', 'ready');
                break;
            }
            case 'error':
                scope.pendingResponse = false;
                fail(scope, event.message);
                break;
            case 'closed':
                disable();
                setStatus('error', 'failure', event.message);
                return;
        }
        await pump(scope);
    }
    return {
        get active() { return current !== null; }, enable, disable,
        async toggle() {
            if (current) disable();
            else await enable();
        },
        async dispose() {
            if (disposed) return;
            disposed = true;
            disable();
            listeners.clear();
            await Promise.allSettled([...closing]);
        },
        getSnapshot,
        subscribe(listener) {
            if (disposed) throw new Error('Voice runtime is disposed.');
            listeners.add(listener);
            listener(getSnapshot());
            return () => { listeners.delete(listener); };
        },
        markStateDirty(key) { current?.broker.markDirty(key); },
        async publishEvent(event) {
            const scope = current;
            if (!scope || !scope.connection || !scope.initialized)
                return;
            scope.events.push(event);
            try {
                await flushEvents(scope, true);
                await pump(scope);
            }
            catch (error) {
                fail(scope, error);
            }
        },
        async resumePlayback() { await current?.connection?.resumePlayback?.(); },
    };
}
