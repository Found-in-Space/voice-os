# Agent Instructions

Read README.md, docs/architecture.md, docs/features.md and docs/usage.md before substantial changes.
Read docs/testing.md for verification and docs/releases.md before changing package metadata or release automation.

- VoiceOS is a domain-neutral voice interaction runtime. Applications own their state, commands and profiles.
- Use strict TypeScript, named exports and factory functions. Ship compiled ESM and declarations through explicit package exports.
- Core code must not import DOM, Node, OpenAI wire events, Three.js, SkyKit, TouchOS or XR implementations.
- Put browser media, OpenAI transport, server and TouchOS integration behind their respective subpaths.
- Keep construction side-effect free. Capture audio only on explicit enablement. Dispose every owned resource and ignore results from obsolete sessions.
- Use injected transports, media and fetch implementations for meaningful offline tests. Never use real credentials or paid API calls in tests.
- Run npm run typecheck, npm test, npm run test:package and npm run example:build before completing implementation.
- Update CHANGELOG.md and the relevant usage/feature documentation when public behavior changes.
- Follow the organization contributor, conduct and private-security reporting guidance linked from CONTRIBUTING.md.
- Pin GitHub Actions by commit SHA. Keep npm publication confined to the version-tag release workflow with trusted publishing.
- Never publish or change credentials as a side effect of building or testing.
