# Contributing to VoiceOS

Follow the [Found in Space contribution guide](https://github.com/Found-in-Space/.github/blob/main/CONTRIBUTING.md)
and [code of conduct](https://github.com/Found-in-Space/.github/blob/main/CODE_OF_CONDUCT.md).
This file supplies VoiceOS's local workflow. Public documentation must remain
usable without access to a private coordination repository.

## Develop locally

Use Node.js 22.12 or later in the 22 LTS line, or Node.js 24 LTS, with npm and
the checked-in lockfile:

```sh
npm ci
npm run verify:release
```

See [testing](docs/testing.md) for individual checks, dependency audits and
host acceptance. Run `npm run example:serve` to try the browser and SkyKit
examples. A server-side OpenAI credential is needed only for an intentional
live voice session; no credentials are needed for offline tests or builds.

Read [architecture](docs/architecture.md), [features](docs/features.md) and
[usage](docs/usage.md) before changing APIs. Keep application state and commands
in the host, the root headless, and platform/provider implementations behind
their explicit subpaths. Follow `AGENTS.md` when using an automated coding agent.

## Propose and validate changes

Search existing issues before opening a focused issue or pull request. Discuss
substantial capabilities and public API changes through an issue. Include a
small consumer example, meaningful behavior tests, relevant documentation and
a changelog entry for an API or behavior change. Do not add tests that only
lock down incidental strings or implementation details.

Use injected transports, media and fetches for tests. Keep live credentials,
private prompts, captured audio and application data out of commits and bug
reports. Explain the resulting behavior, affected consumers, validation and
any manual checks still needed in the pull request.

Versioning and npm publication follow [the release guide](docs/releases.md).
Report vulnerabilities privately using the
[shared security policy](https://github.com/Found-in-Space/.github/blob/main/SECURITY.md).
