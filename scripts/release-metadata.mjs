import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Reject mismatched tags and keep prereleases off npm's stable channel. */
export function releaseMetadata(version, tag) {
  if (tag !== `v${version}`) throw new Error(`Git tag ${tag ?? '(missing)'} must match package version v${version}.`);
  const prerelease = version.split('+')[0].split('-').slice(1).join('-');
  const distTag = prerelease ? prerelease.split('.')[0] : 'latest';
  if (prerelease && (distTag === 'latest' || !/^[a-z][a-z0-9-]*$/.test(distTag))) {
    throw new Error('Use a named prerelease label such as alpha, beta, rc or dev; latest is reserved for stable releases.');
  }
  return { version, distTag };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const metadata = releaseMetadata(version, process.env.GITHUB_REF_NAME);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `package_version=${metadata.version}\ndist_tag=${metadata.distTag}\n`);
  process.stdout.write(`Verified ${version}; npm dist-tag: ${metadata.distTag}\n`);
}
