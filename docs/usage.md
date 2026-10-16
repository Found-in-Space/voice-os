# Usage

Start with the [plain browser example](../examples/browser-minimal/main.js) and
its [trusted server](../examples/server.mjs). The
[SkyKit example](../examples/skykit/main.js) uses the same public imports with
different application commands.

## Install the alpha

Install the current alpha from npm:

```sh
npm install @found-in-space/voice-os@alpha
```

For an exact dependency, use `@found-in-space/voice-os@0.1.0-alpha.0`. To build a
local archive from the independent source repository:

```sh
npm ci
npm run verify:release
npm pack
```

Install the `.tgz` in a consumer with `npm install /path/to/package.tgz`. Use a
copied archive and lockfile when the consumer must build independently of the
producer checkout. Geant's `npm run voice:refresh` automates this flow.

## Share tool declarations

Put contracts in an application module that both browser and server can import.
Keep credentials, prompts and server implementation out of it:

```js
// voice-contracts.js
export const tools = [{
  name: 'set_scale',
  description: 'Set the display scale and return the committed value.',
  parameters: {
    type: 'object',
    properties: { scale: { type: 'number', exclusiveMinimum: 0 } },
    required: ['scale'],
    additionalProperties: false,
  },
}];
```

Handlers run after schema validation. Invoke the same commands as other
controls and return the resulting state. If a command only starts an animation
or job, return `accepted` with its target or job identity rather than claiming
completion. TypeScript can check exact handler names with
`VoiceToolHandlers<typeof tools>`; declare literal contract names with
`as const satisfies readonly VoiceToolContract[]`.

For a typed local tool, `defineVoiceTool<T>({ name, description, parameters,
execute })` checks the JSON schema against `T` and supplies typed arguments to
the handler. Its `contract` can be shared with the server. Share only that
serializable declaration across the browser/server boundary.

## Configure a trusted endpoint

Import `createOpenAIVoiceSessionHandler` or
`createOpenAIVoiceTokenMiddleware` from
`@found-in-space/voice-os/server/openai`. Supply server credentials, an explicit
`authorize(request)` callback, and a registry of approved profiles. Each profile
contains its upstream `configuration`, shared `tools`, and optional `turnMode`.
The runnable example includes a complete configuration and local origin policy.

```js
const handler = createOpenAIVoiceSessionHandler({
  apiKey: serverApiKey,
  authorize: request => applicationAuthorizesVoice(request),
  profiles: {
    explorer: { configuration: approvedSessionConfiguration, tools },
  },
});
// Mount handler(Request) -> Promise<Response> at /api/voice/session.
```

The default selector reads `?profile=explorer`. A custom `resolveProfile(request)`
can choose a profile or return `null` to reject. Only registered names are
accepted. The handler requires POST, returns `Cache-Control: no-store`, and
includes a contract manifest with the ephemeral credential. The browser checks
tool schemas and turn policy before negotiation.

The Node/Vite middleware additionally takes `path` and calls `next()` for other
routes. It starts no server. `requestOpenAIClientSecret` exposes the upstream
operation when a host needs its own HTTP adapter. Credentials and authorization
are host responsibilities; the library reads no `.env`.

## Connect a button

```html
<button id="voice" type="button">Voice</button>
<output id="voice-status" aria-live="polite"></output>
```

```js
import { bindVoiceTools, createVoiceRuntime } from '@found-in-space/voice-os';
import { createOpenAIRealtimeTransport } from '@found-in-space/voice-os/openai';
import { bindVoiceButton } from '@found-in-space/voice-os/browser';
import { tools } from './voice-contracts.js';

const voice = createVoiceRuntime({
  transport: createOpenAIRealtimeTransport({
    sessionEndpoint: '/api/voice/session', profile: 'explorer',
  }),
  tools: bindVoiceTools(tools, {
    set_scale({ scale }) {
      application.setScale(scale);
      return { status: 'completed', scale: application.getScale() };
    },
  }),
});
const detach = bindVoiceButton({
  voice, button: document.querySelector('#voice'),
  status: document.querySelector('#voice-status'),
});

window.addEventListener('pagehide', () => {
  detach();
  void voice.dispose();
}, { once: true });
```

Construction does not request a microphone or connect. The binding toggles
voice from a click; a blocked-playback click retries audio. Subscribe directly
or call `enable`, `disable` and `toggle` for other controls. Browsers require a
secure context for microphone access; localhost is suitable for the example.

The transport creates audio lazily by default. Supply
`audio: createBrowserVoiceAudio({ element, onState })` for an application-owned
host, or `onRemoteStream(stream)` for your own playback. Dispose a supplied audio
host yourself after disposing voice; borrowed elements are preserved. Use
`voice.resumePlayback()` from a gesture when the default host is blocked.

## Supply fresh state

Set `turnMode: 'coordinated'` on **both** server profile and client runtime, then
provide state sources:

```js
const voice = createVoiceRuntime({
  transport,
  turnMode: 'coordinated',
  tools: bindings,
  stateSources: [{
    key: 'view',
    snapshot: signal => application.getViewState({ signal }),
    hasMateriallyChanged: (previous, next) => previous.scale !== next.scale,
  }],
});
```

Sources return JSON-serializable state, with units and frames where relevant.
The runtime captures at initialization and before its own responses, coalesces
unchanged values and awaits acknowledged insertion before inference. Optional
materiality controls significance; `voice.markStateDirty('view')` forces the
next capture to be sent. It does not stream every frame or duplicate your store.

Automatic mode is the default. The provider starts answers after VAD input;
client context or event insertion cannot guarantee ordering ahead of those
automatic answers. Geant retains automatic mode for this extraction.

## Send application events

```js
await voice.publishEvent({
  id: arrival.id,
  type: 'navigation.arrived',
  occurredAt: new Date().toISOString(),
  delivery: 'immediate',
  speech: 'silent',
  data: { latitudeDegrees, longitudeDegrees },
  dedupeKey: arrival.id,
});
```

`immediate` inserts information without waiting for input. `next-turn` waits for
the next user turn or runtime-requested continuation. `silent` never requests
an answer. `proactive` can request speech only when `allowProactive: true` is
also set on the runtime; it waits through user speech, inference, tools and
playback. Multiple pending proactive events can share one response.

Optional `expiresAt` suppresses expired delivery and delayed announcements.
Deduplication lasts for the current session. Events sent while voice is off or
not initialized are ignored; retain durable event history in the application.
Failed delivery sets error status and can be explicitly republished. Turning
voice off discards pending conversation activity.

## Use TouchOS

Install the optional compatible TouchOS peer in the consumer, then import
`createVoiceTouchOsBinding` from `@found-in-space/voice-os/touch-os`:

```js
const binding = createVoiceTouchOsBinding({ voice, id: 'voice' });
// Include binding.createNode() in the application's DisplayNode tree.
const unsubscribe = binding.subscribe(() => invalidatePanel());
for (const output of panel.takeOutputs()) {
  if (binding.handleOutput(output)) continue;
  routeApplicationOutput(output);
}
// On teardown: unsubscribe(); await voice.dispose();
```

The host owns its TouchOS runtime, tree and redraw policy. The binding routes an
action to the same voice instance and offers playback recovery. Existing
custom Geant panels can keep routing their own voice actions.

## Status, errors and cancellation

`subscribe(listener)` immediately supplies the current snapshot and returns an
unsubscribe function. `getSnapshot()` includes state, reason, playback status,
error, session identity, response/tool counts, context version and queued event
count. A protocol error may leave the connection active; disable and enable to
start a new session when needed. No raw microphone audio is retained by the
runtime.

Tool handlers receive `{ signal, sessionId, responseId, callId }`. Honor
`signal` in async application work where possible. Committed commands remain
committed when voice is interrupted or disabled. Unknown tools, invalid
arguments and handler failures produce structured tool results; stale results
are dropped after cancellation.
