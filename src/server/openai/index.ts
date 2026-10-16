import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VoiceToolContract, VoiceTurnMode } from '../../types.js';
export interface VoiceSessionProfile {
    readonly configuration: Readonly<Record<string, unknown>>;
    readonly tools: readonly VoiceToolContract[];
    readonly turnMode?: VoiceTurnMode;
}
export interface VoiceSessionHandlerOptions {
    readonly apiKey?: string;
    readonly profiles: Readonly<Record<string, VoiceSessionProfile>>;
    readonly authorize: (request: Request) => boolean | Promise<boolean>;
    readonly resolveProfile?: (request: Request) => string | null;
    readonly fetch?: typeof fetch;
}
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
/** Reusable upstream call; host credentials and session policy are explicit. */
export async function requestOpenAIClientSecret(options: {
    apiKey: string;
    configuration: Readonly<Record<string, unknown>>;
    fetch?: typeof fetch;
    signal?: AbortSignal;
}): Promise<{
    status: number;
    body: string;
}> {
    const response = await (options.fetch ?? fetch)('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST', signal: options.signal,
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(options.configuration),
    });
    return response.ok ? { status: 200, body: await response.text() } : {
        status: response.status, body: JSON.stringify({ error: `OpenAI could not create a Realtime session (${response.status}).` }),
    };
}
/** Mount in any Web Request/Response host; no server or environment side effects. */
export function createOpenAIVoiceSessionHandler(options: VoiceSessionHandlerOptions) {
    return async (request: Request): Promise<Response> => {
        const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
        const reply = (body: unknown, status: number, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
        if (request.method !== 'POST')
            return reply({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
        if (!await options.authorize(request))
            return reply({ error: 'Cross-origin requests are denied.' }, 403);
        const id = options.resolveProfile ? options.resolveProfile(request) : new URL(request.url).searchParams.get('profile');
        const profile = id && Object.hasOwn(options.profiles, id) ? options.profiles[id] : undefined;
        if (!profile)
            return reply({ error: 'Unknown Realtime experience.' }, 400);
        if (!options.apiKey)
            return reply({ error: 'Voice is unavailable: the local server needs OPENAI_API_KEY.' }, 503);
        const mode = profile.turnMode ?? 'automatic';
        const session = record(profile.configuration.session);
        const audio = record(session.audio), input = record(audio.input);
        const configuration = { ...profile.configuration, session: { ...session,
                tools: profile.tools.map(tool => ({ type: 'function', ...tool })),
                audio: { ...audio, input: { ...input, turn_detection: { ...record(input.turn_detection), create_response: mode === 'automatic', interrupt_response: true } } },
            } };
        try {
            const result = await requestOpenAIClientSecret({ apiKey: options.apiKey, configuration, fetch: options.fetch, signal: request.signal });
            if (result.status !== 200)
                return new Response(result.body, { status: result.status, headers });
            const payload = record(JSON.parse(result.body));
            return reply({ ...payload, voiceOs: { contractVersion: 1, profile: id, tools: profile.tools, turnMode: mode } }, 200);
        }
        catch {
            return reply({ error: 'Voice session setup failed.' }, 502);
        }
    };
}
/** Optional Node/Vite middleware over the same Web handler. */
export function createOpenAIVoiceTokenMiddleware(options: VoiceSessionHandlerOptions & {
    path: string;
}) {
    const handle = createOpenAIVoiceSessionHandler(options);
    return async (request: IncomingMessage, response: ServerResponse, next: () => void): Promise<void> => {
        const url = new URL(request.url ?? '/', 'http://local');
        if (url.pathname !== options.path) {
            next();
            return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers))
            if (value !== undefined)
                headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        const abort = new AbortController();
        const onAbort = () => abort.abort();
        request.once('aborted', onAbort);
        try {
            const result = await handle(new Request(url, { method: request.method, headers, signal: abort.signal }));
            response.statusCode = result.status;
            result.headers.forEach((value, name) => response.setHeader(name, value));
            response.end(await result.text());
        }
        finally {
            request.removeListener('aborted', onAbort);
        }
    };
}
