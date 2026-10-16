# Changelog

## 0.1.0-alpha.1 — 2026-10-16

- Release through the version-tag GitHub Actions workflow with npm trusted
  publishing and provenance. The initial alpha used an owner-authorized
  bootstrap upload.
- Document npm setup, registry processing and the initial `latest` label behavior.

The runtime API is unchanged from `0.1.0-alpha.0`. Live microphone, playback and
Quest acceptance remain outstanding; this release remains experimental.

## 0.1.0-alpha.0 — 2026-10-16

Initial extraction from Pas de Géant into an independently reusable package:

- Headless TypeScript runtime with normalized transport contracts and explicit
  ESM/declaration exports.
- OpenAI WebRTC transport, trusted server session helpers, optional browser
  audio/button and TouchOS binding.
- Shared JSON Schema tool contracts, validated execution, call deduplication,
  session cancellation and isolation of obsolete work.
- Automatic and coordinated turns, acknowledged application-state replacement,
  materiality and dirty marking.
- Silent and next-turn events, deduplication, expiry and opt-in proactive speech.
- Plain-browser and SkyKit examples plus external packed-consumer verification.

The walking and eclipse experiences in Pas de Géant are the initial consumers.
The alpha API may change before a stable release. Live microphone, playback and
Quest acceptance remain separate from offline verification.
