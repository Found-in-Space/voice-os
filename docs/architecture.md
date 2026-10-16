# Architecture

The application owns its authoritative state, commands, tool contracts and
trusted voice profiles. VoiceOS owns connection-scoped conversation activity,
validated tool execution, response scheduling, context delivery and teardown.
Voice, TouchOS, controllers and desktop controls can invoke the same ordinary
application commands.

## Package structure

```text
src/
  index.ts                     headless public exports
  types.ts                     provider-neutral contracts
  runtime.ts                   lifecycle and turn coordinator
  tools.ts                     tool bindings and schema validation
  context-broker.ts            application state capture/materiality
  transports/openai-realtime/  browser WebRTC and provider event translation
  browser/                     audio host and optional DOM binding
  server/openai/               upstream client-secret request and HTTP adapters
  adapters/touch-os/           optional TouchOS output binding
examples/
  browser-minimal/             framework-free scale command
  skykit/                      independent view-state/navigation consumer
  server.mjs                   explicit local example host
tests/                         fake transports, media, network and host adapters
scripts/                       build, packed-consumer verification and examples
```

The root has no provider, DOM, Node, rendering or UI implementation imports.
Only the optional TouchOS subpath imports TouchOS, which is an optional peer.
Server code imports Node HTTP types for its optional middleware; the Web
Request/Response handler also works in a host without a Node server. Importing
any entry point starts no service and acquires no media.

## Session and resource ownership

Each enable attempt owns an AbortController, connection, response identities,
tool-call cache, context broker and event queues. Disable detaches the current
scope before aborting it. A late connection closes itself; late tool results
cannot write into a successor session. Factories keep instances independent.
Dispose disables the runtime, clears subscriptions and awaits known connection
close operations. Browser permission prompts cannot be forcibly dismissed; if
a microphone arrives after cancellation, its tracks are stopped immediately.

The OpenAI adapter owns each peer, data channel, network cancellation and
microphone stream. Its default audio host owns its lazily created audio element.
A supplied audio host belongs to the caller, and a supplied audio element stays
in the caller's DOM. The adapter clears borrowed playback when disconnected;
the caller disposes its own host. Audio playback failure is separate from
inference state and can be retried from a user gesture.

Interruption preserves committed application commands. Handlers receive a
session AbortSignal plus session, response and call identities, and should pass
cancellation into their own async work where appropriate. Cancelling voice
does not undo a scale, location or simulation change already committed by the
application.

## Tools and profiles

A serializable tool contract contains a name, description and JSON Schema.
The same declarations are imported by browser bindings and trusted server
profiles. Binding rejects missing, extra and duplicate names. The executor
validates arguments with Ajv before calling a handler, returns structured
failures, and sends each call's output once per session. TypeScript hosts can
use `defineVoiceTool<T>` for schema/argument typing or `VoiceToolHandlers` for
exact binding names.

The server selects only registered profiles and derives tools and turn policy
from the shared declarations. The client checks the returned contract manifest
before WebRTC negotiation. Application authentication, origin rules,
credentials, model, voice, instructions and tool permissions belong to the
host. The package reads no environment variables and starts no HTTP service.

## Turns, state and events

Automatic mode retains provider VAD response creation, as used by the initial
Geant migration. Coordinated mode configures VAD to commit and interrupt input
without automatically answering. After committed input, the runtime captures
fresh state, waits for acknowledged insertion, and then requests inference.
Greeting, user answers, tool continuations and opt-in proactive speech share
one coordinator. It waits through active input, inference, tools and buffered
output, including the gap before a requested response has started.

State sources are sampled at initialization and before runtime-requested
responses. The broker clones serializable values to detect mutation, coalesces
unchanged snapshots, applies optional application materiality and preserves
dirty marks arriving during capture. Failed insertion invalidates the capture
for retry. OpenAI inserts one labelled state message, awaits its correlated
acknowledgement, then deletes only the preceding VoiceOS state message. It does
not rewrite user history or application events.

Application events carry independent delivery and speech policies. Immediate
events are inserted without requiring speech; next-turn events wait for a turn.
Deduplication and expiry apply within a session. Proactive speech requires both
an event request and the runtime's explicit permission, and waits until idle.
Acknowledged event messages stay in conversation history; expiry suppresses
new delivery or a delayed announcement, rather than retracting history.

For guaranteed context insertion before a user answer, use coordinated mode on
both server and client. Automatic provider responses can begin before a client
state update or next-turn event has been acknowledged.
