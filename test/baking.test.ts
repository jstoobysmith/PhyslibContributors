import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bakeSvg, unbakeSvg } from '../src/lib/baking';
import { buildCredential } from '../src/lib/credential';
import { generateKeyPair, sign } from '../src/lib/dataIntegrity';
import { verificationMethodId } from '../src/lib/config';
import { exampleRecord, exampleSubmission } from './fixtures/example';

describe('baked badges', () => {
  it('round-trips a signed credential through an SVG badge', async () => {
    const svg = readFileSync(new URL('../public/badges/review.svg', import.meta.url), 'utf8');
    const vc = await sign(buildCredential('x', exampleSubmission, exampleRecord), {
      secretKeyMultibase: generateKeyPair().secretKeyMultibase,
      verificationMethod: verificationMethodId('key-1'),
    });
    const baked = bakeSvg(svg, vc);
    expect(baked).toContain('xmlns:openbadges="https://purl.imsglobal.org/ob/v3p0"');
    expect(JSON.parse(unbakeSvg(baked)!)).toEqual(vc);
    expect(unbakeSvg(svg)).toBeUndefined();
  });
});
