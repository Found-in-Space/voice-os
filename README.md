# VoiceOS

VoiceOS is a domain-neutral voice interaction runtime for interactive
applications. Supply application commands
and a trusted voice profile; VoiceOS connects the microphone, runs validated
tools, coordinates responses and releases its resources when disabled.

VoiceOS follows TouchOS's headless runtime and optional adapter structure.
Application state and commands remain in the application. The root imports
without a DOM, OpenAI client, Three.js, SkyKit, TouchOS or XR. It is part of
[Found in Space](https://foundin.space/), where reusable data, models and tools
support exploring, questioning and building.

| Import | Use |
| --- | --- |
| `@found-in-space/voice-os` | Runtime, tool contracts, context, events and subscriptions |
| `@found-in-space/voice-os/openai` | Browser WebRTC transport and OpenAI event translation |
| `@found-in-space/voice-os/browser` | Optional audio host and DOM button binding |
| `@found-in-space/voice-os/server/openai` | Trusted session endpoint for Web or Node hosts |
| `@found-in-space/voice-os/touch-os` | Optional TouchOS button/output binding |

## Try the examples

From this source checkout, with Node.js 22.12 or later (or Node.js 24 LTS):

```sh
npm ci
npm run example:serve
```

Open <http://127.0.0.1:4188/> for a plain browser button and scale command, or
<http://127.0.0.1:4188/skykit/> for a SkyKit viewer with view-state and navigation
tools. To speak, supply `OPENAI_API_KEY` in the **server's** environment before
starting the example. It is never included in a browser bundle. Enabling voice
uses your configured OpenAI account; building and testing the examples uses
offline fixtures.

Install the experimental alpha in another application:

```sh
npm install @found-in-space/voice-os@alpha
```

For a local build, run `npm pack` in this checkout and install the archive. See
[installation and integration](docs/usage.md#install-the-alpha).

The [usage guide](docs/usage.md) shows client/server setup, shared tools,
coordinated context, events, TouchOS integration and teardown. The runnable
examples use the same public imports as other applications.

## Develop and verify

```sh
npm run verify:release
npm pack
```

Verification checks strict TypeScript, offline behavior, a packed installation
in a separate consumer, Node imports without DOM, declarations, browser
bundling, optional TouchOS and both example builds. Source is strict TypeScript;
the npm artifact contains compiled ESM and declarations with explicit exports.
CI additionally runs dependency audits on Node.js 22 and 24. See
[testing and host acceptance](docs/testing.md) for the checks and their limits.

This is an experimental `0.1.0-alpha.0` package. Pas de Géant's walking and eclipse
experiences consume a generated npm archive in that repository's `vendor/npm`.
This keeps a standalone Geant checkout buildable while the alpha is developed.
Run `npm run voice:refresh` in Geant to rebuild and install the sibling VoiceOS
source. Registry consumers should pin the exact package version.

## Documentation and contributions

- [Architecture](docs/architecture.md): ownership, package boundaries and lifecycle.
- [Features](docs/features.md): implemented alpha surface and acceptance limits.
- [Usage](docs/usage.md): shared tools, server setup, context, events and UI adapters.
- [Testing](docs/testing.md): offline verification and manual host acceptance.
- [Releases](docs/releases.md): npm trusted publishing and version/tag rules.
- [Changelog](CHANGELOG.md): release notes and compatibility changes.
- [Contributing](CONTRIBUTING.md): local workflow and shared project guidance.

Questions and reproducible bugs belong in
[VoiceOS issues](https://github.com/Found-in-Space/voice-os/issues). Follow the
[shared security policy](https://github.com/Found-in-Space/.github/blob/main/SECURITY.md)
for private vulnerability reports. The software uses the [MIT licence](LICENSE).
