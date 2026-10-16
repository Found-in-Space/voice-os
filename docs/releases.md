# Releases and npm publication

VoiceOS follows TouchOS's tag-based release convention. The source repository
is `Found-in-Space/voice-os`; the public npm package is
`@found-in-space/voice-os`. The current package version is `0.1.0-alpha.1`;
`0.1.0-alpha.0` was the owner-authorized bootstrap release.

## Automation

- `ci.yml` checks pushes to `main` and pull requests on Node.js 22 and 24. It
  runs `npm run verify:release` and both development/runtime dependency audits.
- `release.yml` runs only for pushed `v*` tags in this repository. It checks
  the tag against `package.json`, repeats verification and audits, then publishes
  publicly to npm with provenance.

Actions are pinned to commit SHAs. The release uses a GitHub-hosted Ubuntu
runner, Node.js 24 and its npm CLI, the `npm` environment, and job-scoped
`id-token: write` permission. It uses npm trusted publishing through OIDC;
there is no `NPM_TOKEN` secret or token fallback in the workflow. Release
package-manager caching is disabled. The `npm` environment requires `kws` review
and disables administrator bypass; the owner can explicitly approve their own
release. Ordinary pushes, pull requests, builds and
tests do not publish.

## One-time npm setup

An npm package owner must configure the package's trusted publisher:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization/user | `Found-in-Space` |
| Repository | `voice-os` |
| Workflow filename | `release.yml` |
| Environment | `npm` |
| Allowed action | Direct `npm publish` |

The npm-side package/bootstrap and trust configuration are separate from
creating the GitHub repository; this workflow does not configure an npm account.
Complete that setup before pushing the first release tag. If the package needs
an initial authenticated publication to expose its settings, treat it as a
deliberate maintainer bootstrap, then configure trusted publishing for later
releases. Do not add long-lived write credentials to the workflow as a workaround.

With npm 11.15 or later, a package owner can configure and inspect the same
settings through the CLI after browser/2FA login:

```sh
npm trust github @found-in-space/voice-os \
  --repository=Found-in-Space/voice-os --file=release.yml \
  --environment=npm --allow-publish
npm trust list @found-in-space/voice-os --json
```

The package and this trusted publisher were created on 16 October 2026. Read
back the npm policy rather than treating successful repository creation as
evidence of npm authorization. The initial alpha uses an owner-authorized
bootstrap upload; subsequent versions use the tagged GitHub workflow.

Trusted publishing requires npm 11.5.1+ and Node.js 22.14+. The release runner's
Node.js 24 toolchain meets those requirements. The configured npm trust must
match the repository, workflow and environment exactly; new npm configurations
must complete their first publication within npm's validation window. See the
[npm trusted-publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for current setup, validation windows and allowed actions. Changes to GitHub
environment review rules are separate repository-owner decisions.

The first successful publish through a new trusted publisher must happen within
two days of its creation; otherwise recreate the expired configuration before
releasing. A successful owner bootstrap is separate from that first CI publish.

## Prepare a release

1. Complete the [manual host acceptance](testing.md#manual-host-acceptance)
   relevant to the change. The initial alpha remains experimental while this
   acceptance is outstanding.
2. Update the version and lockfile using npm, for example
   `npm version 0.1.0-alpha.1 --no-git-tag-version`. Update `CHANGELOG.md` and
   installation/status documentation to describe the release accurately.
3. Run `npm run verify:release`, both audit commands from the testing guide,
   and inspect `npm pack --dry-run` for the intended ESM, declarations, docs,
   examples and licence. Secrets, source internals and build scratch stay out.
4. Commit and push the reviewed version to `main`. After CI passes, create and
   push the matching tag. After the owner bootstrap of `0.1.0-alpha.0`, the next
   alpha uses:

   ```sh
   git tag -a v0.1.0-alpha.1 -m "VoiceOS 0.1.0-alpha.1"
   git push origin v0.1.0-alpha.1
   ```

5. Confirm the Release workflow succeeds and npm shows the intended version,
   dist-tag and provenance. Add GitHub release notes from the changelog when
   useful, and update consumers to the exact published version.

npm can accept an upload before the version becomes publicly available. Verify
the exact version, dist-tag and archive integrity in the registry before
announcing installation or moving a consumer dependency. Do not resubmit the
same version merely because registry processing has not finished. If npm lists
a staged package, inspect and approve it with the separate `npm stage` flow.

Stable versions publish to `latest`. Prereleases publish to their first named
label: `0.1.0-alpha.0` uses `alpha`, `0.2.0-dev.1` uses `dev`, and
`0.2.0-rc.1` uses `rc`. Numeric-only labels and a prerelease named `latest`
are rejected, as are mismatched version tags. Failed verification or audits
stop publication. Do not move published version tags or reuse npm versions.

On the initial bootstrap, npm assigned both `alpha` and `latest` to
`0.1.0-alpha.0` despite the explicit alpha publication tag. The registry rejects
removing `latest` with HTTP 400, matching the
[reported npm behavior](https://github.com/npm/cli/issues/8490). The version is
still an experimental alpha; use the explicit version or `@alpha`. Subsequent
prerelease workflow publishes select only their named channel.

The workflow can be rerun for a transient failure before a version is published.
After publication, fix the problem in a new version. GitHub environment approval
and npm package-owner setup are external requirements; a valid YAML workflow
alone does not establish publishing permission.
