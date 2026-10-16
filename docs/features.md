# Features

The initial alpha extracts browser WebRTC voice from Pas de Géant. Both its
walking and eclipse pages use the same package. A plain browser example and an
independent SkyKit example demonstrate reuse through public imports.

Available:

- Headless factories, status subscriptions, independent instances and teardown.
- Session-scoped cancellation and rejection of obsolete connection/tool work.
- Shared JSON Schema tool declarations, runtime validation and call deduplication.
- OpenAI browser WebRTC, normalized events and trusted session creation.
- Automatic VAD turns and opt-in coordinated turns with acknowledged context.
- State sources, materiality, dirty marking and replacement snapshots.
- Silent and next-turn application events, deduplication, expiry and opt-in
  proactive speech deferred while busy.
- Optional browser audio, blocked-playback recovery, DOM button and TouchOS binding.
- Injectable transport, media, fetch, peer and audio implementations for offline tests.

The package contains no geocoder, astronomical model, research service,
universal tool set, application command bus or built-in personality. Hosts
supply those capabilities and report their actual results. No common hosted
credential or voice service is required.

## Validation

`npm run verify:release` checks types and offline behavior, then installs an
actual npm tarball in an external consumer. It checks import/declaration
resolution, headless Node use, browser bundling without server code, optional
TouchOS integration and example builds. CI runs the same command on Node.js 22
and 24, plus development and production dependency audits. See
[testing](testing.md) and [releases](releases.md) for the complete workflow.

Tests cover failed token acquisition with late media permission, cancelled
negotiation, old results after reconnect, tool validation and continuation,
context acknowledgement and retry, input during initialization, interruption,
buffered playback/error ordering and application event policies. Host tests
exercise real TouchOS runtime output with fake media and network.

Physical microphone, speaker, browser autoplay and Quest acceptance remain
host checks. The alpha has not been validated against a paid live Realtime
session during extraction. Automatic mode preserves Geant's response policy;
its coordinated state/event features are available for hosts to adopt
deliberately. Model access and application profile choices stay with each host.
