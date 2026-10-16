import { describe, expect, it } from 'vitest';
import { releaseMetadata } from '../scripts/release-metadata.mjs';

describe('npm release selection', () => {
  it('publishes stable versions to latest', () => {
    expect(releaseMetadata('1.2.3', 'v1.2.3')).toEqual({ version: '1.2.3', distTag: 'latest' });
  });
  it.each(['alpha', 'beta', 'rc', 'dev', 'preview-next'])('keeps %s prereleases on their own channel', label => {
    expect(releaseMetadata(`0.1.0-${label}.0`, `v0.1.0-${label}.0`).distTag).toBe(label);
  });
  it('rejects mismatched or missing version tags', () => {
    expect(() => releaseMetadata('0.1.0-alpha.0', 'v0.1.0')).toThrow('must match');
    expect(() => releaseMetadata('0.1.0-alpha.0', undefined)).toThrow('must match');
  });
  it.each(['latest', '0'])('rejects an unsafe %s prerelease channel', label => {
    expect(() => releaseMetadata(`0.1.0-${label}.0`, `v0.1.0-${label}.0`)).toThrow('named prerelease');
  });
});
