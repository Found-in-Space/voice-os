import { createBrowserVoiceAudio, type VoiceAudioHost } from '../../browser/audio.js';
import type { VoiceApplicationEvent, VoiceContextSnapshot, VoiceConnection, VoiceTransport, VoiceTransportEvent } from '../../types.js';
import { errorMessage } from '../../tools.js';
export interface OpenAIRealtimeTransportOptions {
    sessionEndpoint: string;
    profile?: string;
    fetch?: typeof fetch;
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    createPeerConnection?: () => RTCPeerConnection;
    createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream;
    audio?: VoiceAudioHost;
    onRemoteStream?: (stream: MediaStream | null) => void;
    onMicrophoneSettings?: (settings: readonly MediaTrackSettings[]) => void;
}
type WireEvent = Record<string, unknown>;
const record = (value: unknown): WireEvent | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as WireEvent : undefined;
export function createRealtimeGreetingEvent(instructions: string) {
    return { type: 'response.create', response: { instructions, output_modalities: ['audio'] } };
}
/** Browser WebRTC adapter. All browser access occurs inside connect(). */
export function createOpenAIRealtimeTransport(options: OpenAIRealtimeTransportOptions): VoiceTransport {
    let latest: object | null = null;
    return {
        async connect(context) {
            const attempt = {};
            latest = attempt;
            const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
            const audio = options.audio ?? (options.onRemoteStream ? null : createBrowserVoiceAudio());
            let stream: MediaStream | null = null;
            let peer: RTCPeerConnection | null = null;
            let channel: RTCDataChannel | null = null;
            let closed = false;
            const requests = new AbortController();
            let itemSequence = 0;
            let previousContextId: string | null = null;
            let contextTail = Promise.resolve();
            const acknowledgements = new Map<string, {
                resolve(): void;
                reject(error: unknown): void;
            }>();
            const live = () => !closed && !context.signal.aborted;
            const emit = async (event: VoiceTransportEvent) => { if (live())
                await context.emit(event); };
            const stopTracks = (value: MediaStream) => { for (const track of value.getTracks())
                track.stop(); };
            function cleanup() {
                if (closed)
                    return;
                closed = true;
                requests.abort();
                context.signal.removeEventListener('abort', cleanup);
                for (const waiter of acknowledgements.values())
                    waiter.reject(new Error('Voice session closed.'));
                acknowledgements.clear();
                channel?.close();
                peer?.close();
                if (stream) {
                    stopTracks(stream);
                    stream = null;
                }
                if (!options.audio)
                    audio?.dispose();
                if (latest === attempt) {
                    options.audio?.setStream(null, () => undefined);
                    options.onRemoteStream?.(null);
                }
            }
            context.signal.addEventListener('abort', cleanup, { once: true });
            function send(event: unknown): boolean {
                if (!live() || channel?.readyState !== 'open')
                    return false;
                channel.send(JSON.stringify(event));
                return true;
            }
            async function insertItem(payload: unknown, signal: AbortSignal): Promise<string> {
                signal.throwIfAborted();
                const id = `voice_item_${++itemSequence}`;
                await new Promise<void>((resolve, reject) => {
                    const onAbort = () => done(signal.reason);
                    function done(error?: unknown) {
                        signal.removeEventListener('abort', onAbort);
                        acknowledgements.delete(id);
                        if (error !== undefined)
                            reject(error);
                        else
                            resolve();
                    }
                    acknowledgements.set(id, { resolve: () => done(), reject: done });
                    signal.addEventListener('abort', onAbort, { once: true });
                    const sent = send({ type: 'conversation.item.create', event_id: id,
                        item: { id, type: 'message', role: 'user', content: [{ type: 'input_text', text: JSON.stringify(payload) }] } });
                    if (!sent)
                        done(new Error('Voice data channel is not open.'));
                });
                return id;
            }
            async function handle(raw: unknown) {
                if (!live() || typeof raw !== 'string')
                    return;
                let event: WireEvent | undefined;
                try {
                    event = record(JSON.parse(raw));
                }
                catch {
                    return;
                }
                if (!event)
                    return;
                const item = record(event.item);
                if ((event.type === 'conversation.item.done' || event.type === 'conversation.item.created') && typeof item?.id === 'string')
                    acknowledgements.get(item.id)?.resolve();
                if (event.type === 'conversation.item.added' && item?.status === 'completed' && typeof item.id === 'string')
                    acknowledgements.get(item.id)?.resolve();
                switch (event.type) {
                    case 'session.created':
                        await emit({ type: 'ready' });
                        break;
                    case 'input_audio_buffer.speech_started':
                        await emit({ type: 'speech-start' });
                        break;
                    case 'input_audio_buffer.speech_stopped':
                        await emit({ type: 'speech-stop' });
                        break;
                    case 'input_audio_buffer.committed':
                        await emit({ type: 'user-turn-committed' });
                        break;
                    case 'response.created': {
                        const response = record(event.response);
                        if (typeof response?.id === 'string')
                            await emit({ type: 'response-start', id: response.id });
                        break;
                    }
                    case 'output_audio_buffer.started':
                        await emit({ type: 'playback-start' });
                        break;
                    case 'output_audio_buffer.stopped':
                    case 'output_audio_buffer.cleared':
                        await emit({ type: 'playback-stop' });
                        break;
                    case 'response.done': {
                        const response = record(event.response);
                        if (typeof response?.id !== 'string')
                            break;
                        const details = record(response.status_details);
                        const error = record(details?.error);
                        const message = typeof error?.message === 'string' ? error.message
                            : typeof details?.reason === 'string' ? `Voice response ended early (${details.reason}). Try again.` : undefined;
                        const calls = (Array.isArray(response.output) ? response.output : []).flatMap((value: unknown) => {
                            const call = record(value);
                            return call?.type === 'function_call' && typeof call.call_id === 'string' && typeof call.name === 'string' && typeof call.arguments === 'string'
                                ? [{ id: call.call_id, name: call.name, arguments: call.arguments }] : [];
                        });
                        await emit({ type: 'response-done', id: response.id, status: String(response.status), error: message, calls });
                        break;
                    }
                    case 'error': {
                        const error = record(event.error);
                        const message = typeof error?.message === 'string' ? error.message : 'Realtime API error.';
                        if (typeof error?.event_id === 'string')
                            acknowledgements.get(error.event_id)?.reject(new Error(message));
                        await emit({ type: 'error', message });
                        break;
                    }
                }
            }
            try {
                context.signal.throwIfAborted();
                const media = (options.getUserMedia ?? (constraints => navigator.mediaDevices.getUserMedia(constraints)))({ audio: {
                        autoGainControl: true, echoCancellation: true, noiseSuppression: true,
                    } }).then(value => {
                    if (!live()) {
                        stopTracks(value);
                        throw new Error('Voice connection cancelled.');
                    }
                    stream = value;
                    options.onMicrophoneSettings?.(value.getAudioTracks().map(track => track.getSettings()));
                    return value;
                });
                let endpoint = options.sessionEndpoint;
                if (options.profile)
                    endpoint += `${endpoint.includes('?') ? '&' : '?'}profile=${encodeURIComponent(options.profile)}`;
                const authorization = fetcher(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, signal: requests.signal }).then(async (response) => {
                    const payload = record(await response.json().catch(() => ({})));
                    if (!response.ok || typeof payload?.value !== 'string')
                        throw new Error(typeof payload?.error === 'string' ? payload.error : `Voice server returned ${response.status}.`);
                    const manifest = record(payload.voiceOs);
                    if (manifest || context.tools.length) {
                        if (manifest?.contractVersion !== 1 || signature(manifest.tools) !== signature(context.tools))
                            throw new Error('Voice profile tool contract does not match the client.');
                    }
                    if ((manifest || context.turnMode === 'coordinated') && manifest?.turnMode !== context.turnMode)
                        throw new Error('Voice turn policy does not match the server profile.');
                    if (options.profile && manifest && manifest.profile !== options.profile)
                        throw new Error('Voice server selected a different profile.');
                    return payload.value;
                });
                const [microphone, token] = await Promise.all([media, authorization]);
                context.signal.throwIfAborted();
                peer = (options.createPeerConnection ?? (() => new RTCPeerConnection()))();
                const connectionPeer = peer;
                peer.addEventListener('track', event => {
                    if (!live())
                        return;
                    const remote = event.streams[0] ?? (options.createMediaStream ?? (tracks => new MediaStream(tracks)))([event.track]);
                    options.onRemoteStream?.(remote);
                    audio?.setStream(remote, error => { void emit({ type: 'playback-blocked', error: errorMessage(error) }); });
                });
                peer.addEventListener('connectionstatechange', () => {
                    if (live() && connectionPeer.connectionState === 'failed') {
                        void emit({ type: 'closed', message: 'Voice connection failed.' }).finally(cleanup);
                    }
                });
                for (const track of microphone.getAudioTracks())
                    peer.addTrack(track, microphone);
                channel = peer.createDataChannel('oai-events');
                channel.addEventListener('message', event => { void handle(event.data).catch(error => emit({ type: 'error', message: errorMessage(error) })); });
                channel.addEventListener('close', () => {
                    if (live())
                        void emit({ type: 'closed', message: 'Voice connection closed.' }).finally(cleanup);
                });
                const offer = await peer.createOffer();
                context.signal.throwIfAborted();
                await peer.setLocalDescription(offer);
                context.signal.throwIfAborted();
                const answer = await fetcher('https://api.openai.com/v1/realtime/calls', {
                    method: 'POST', body: offer.sdp, signal: requests.signal,
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
                });
                if (!answer.ok)
                    throw new Error(`OpenAI Realtime returned ${answer.status}.`);
                const sdp = await answer.text();
                context.signal.throwIfAborted();
                await peer.setRemoteDescription({ type: 'answer', sdp });
                context.signal.throwIfAborted();
                const connection: VoiceConnection = {
                    requestResponse(instructions) { return send(instructions ? createRealtimeGreetingEvent(instructions) : { type: 'response.create' }); },
                    sendToolResult(callId, result) { return send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) } }); },
                    replaceContext(snapshot: VoiceContextSnapshot, signal) {
                        const job = contextTail.then(async () => {
                            const id = await insertItem({ kind: 'application-state', ...snapshot }, signal);
                            signal.throwIfAborted();
                            if (previousContextId)
                                send({ type: 'conversation.item.delete', item_id: previousContextId });
                            previousContextId = id;
                        });
                        contextTail = job.catch(() => undefined);
                        return job;
                    },
                    async publishEvent(event: VoiceApplicationEvent, signal) { await insertItem({ kind: 'application-event', ...event }, signal); },
                    async resumePlayback() { if (await audio?.resume())
                        await emit({ type: 'playback-resumed' }); },
                    close: cleanup,
                };
                return connection;
            }
            catch (error) {
                cleanup();
                throw error;
            }
        },
    };
}
function signature(value: unknown): string {
    const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
        : item !== null && typeof item === 'object'
            ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, data]) => [key, canonical(data)]))
            : item;
    return JSON.stringify(canonical(value));
}
