# Releases and npm publication

VoiceOS follows TouchOS's tag-based release convention. The source repository
is `Found-in-Space/voice-os`; the public npm package is
`@found-in-space/voice-os`. The initial alpha version is `0.1.0-alpha.0`.

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

Trusted publishing requires npm 11.5.1+ and Node.js 22.14+. The release runner's
Node.js 24 toolchain meets those requirements. The configured npm trust must
match the repository, workflow and environment exactly; new npm configurations
must complete their first publication within npm's validation window. See the
[npm trusted-publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for current setup, validation windows and allowed actions. Changes to GitHub
environment review rules are separate repository-owner decisions.

## Prepare a release

1. Complete the [manual host acceptance](testing.md#manual-host-acceptance)
   relevant to the change; the first alpha still needs this acceptance.
2. Update the version and lockfile using npm, for example
   `npm version 0.1.0-alpha.1 --no-git-tag-version`. Update `CHANGELOG.md` and
   installation/status documentation to describe the release accurately.
3. Run `npm run verify:release`, both audit commands from the testing guide,
   and inspect `npm pack --dry-run` for the intended ESM, declarations, docs,
   examples and licence. Secrets, source internals and build scratch stay out.
4. Commit and push the reviewed version to `main`. After CI passes, create and
   push the matching tag. For the first alpha:

   ```sh
   git tag -a v0.1.0-alpha.0 -m "VoiceOS 0.1.0-alpha.0"
   git push origin v0.1.0-alpha.0
   ```

5. Confirm the Release workflow succeeds and npm shows the intended version,
   dist-tag and provenance. Add GitHub release notes from the changelog when
   useful, and update consumers to the exact published version.

Stable versions publish to `latest`. Prereleases publish to their first named
label: `0.1.0-alpha.0` uses `alpha`, `0.2.0-dev.1` uses `dev`, and
`0.2.0-rc.1` uses `rc`. Numeric-only labels and a prerelease named `latest`
are rejected, as are mismatched version tags. Failed verification or audits
stop publication. Do not move published version tags or reuse npm versions.

The workflow can be rerun for a transient failure before a version is published.
After publication, fix the problem in a new version. GitHub environment approval
and npm package-owner setup are external requirements; a valid YAML workflow
alone does not establish publishing permission.
