# Testing and host acceptance

Use Node.js 22.12 or later in the 22 LTS line, or Node.js 24 LTS. The package's
runtime supports Node.js 22+; the development test runner needs 22.12+.

```sh
npm ci
npm run verify:release
```

`verify:release` runs these checks:

| Command | What it establishes |
| --- | --- |
| `npm run typecheck` | Strict TypeScript for source and typed test fixtures |
| `npm test` | Runtime lifecycle, tool/turn/context/event behavior, transport cleanup, server profiles, host bindings and release channel selection |
| `npm run test:package` | Build and actual npm tarball installation in a separate consumer, Node imports without DOM, declarations, optional TouchOS and a browser bundle without server code |
| `npm run example:build` | Plain browser and independent SkyKit examples bundle through public package imports |

Tests use fake transports, media, peer connections, audio and HTTP responses.
They do not call a paid provider, request a real microphone or start a browser.
The package consumer installs from the local npm cache; `npm ci` must first
populate dependencies. Network access is needed for the initial install and
these separate advisory checks, also run by CI and the publication workflow:

```sh
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

CI verifies Node.js 22 and 24 with the lockfile. Publication repeats all checks
from the tagged commit rather than relying on a different branch's CI result.

## Manual host acceptance

Before the first npm release, run the examples and both Geant voice consumers
in a real browser and Quest where supported. Record the browser/device,
package version and results:

1. Explicit enablement requests the microphone and speaks the configured greeting.
2. A normal query and a tool command report actual application state/results.
3. New speech interrupts playback without losing a committed application command.
4. Disable and re-enable release media and start a fresh conversation.
5. Navigation, host disposal and XR exit release owned media and audio resources.
6. If autoplay is blocked, a button/controller gesture recovers audio.

For hosts adopting coordinated turns, also check that changed application state
is inserted before answering. Check that silent events do not trigger speech
and proactive events wait while the user speaks. Offline tests cover ordering;
host acceptance checks actual browser/provider behavior.

Live sessions use the host's configured account. Keep its API key in the server
environment. Acceptance records must not include credentials or raw audio.
