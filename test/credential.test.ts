import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2019 from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';

import { buildCredential, evidenceOf, rehomeCredential, reviewParticipants, sectionIdOf, slugOf, titleOf, type OpenBadgeCredential } from '../src/lib/credential';
import { generateKeyPair, sign } from '../src/lib/dataIntegrity';
import { ISSUER_DID, SITE_URL, verificationMethodId } from '../src/lib/config';
import { exampleRecord, exampleSubmission } from './fixtures/example';

const schema = JSON.parse(readFileSync(new URL('./fixtures/ob_v3p0_achievementcredential_schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2019({ strict: false, allErrors: true });
addFormats(ajv);
const validateOb3 = ajv.compile(schema);

describe('Open Badges 3.0 credential', () => {
  it('passes the official 1EdTech AchievementCredential JSON schema, signed and unsigned', async () => {
    const vc = buildCredential('x', exampleSubmission, exampleRecord);
    expect(validateOb3(vc), JSON.stringify(validateOb3.errors, null, 2)).toBe(true);
    const signed = await sign(vc, { secretKeyMultibase: generateKeyPair().secretKeyMultibase, verificationMethod: verificationMethodId('key-1') });
    expect(validateOb3(signed), JSON.stringify(validateOb3.errors, null, 2)).toBe(true);
  });

  it('works without optional fields', () => {
    const { period: _p, ...rest } = exampleSubmission;
    const minimal = { ...rest, recipient: { github: 'someone', name: 'Some One' } };
    expect(validateOb3(buildCredential('y', minimal, { acceptedAt: '2026-07-03T09:00:00Z' }))).toBe(true);
  });

  it('turns a month period into the first and last day', () => {
    const vc = buildCredential('x', { ...exampleSubmission, period: { from: '2024-02', to: '2024-02' } }, exampleRecord) as unknown as OpenBadgeCredential;
    expect(vc.credentialSubject.activityStartDate).toBe('2024-02-01T00:00:00Z');
    expect(vc.credentialSubject.activityEndDate).toBe('2024-02-29T00:00:00Z');
  });

  it('can be read back', () => {
    const vc = buildCredential('the-slug', exampleSubmission, exampleRecord) as unknown as OpenBadgeCredential;
    expect(sectionIdOf(vc)).toBe('review');
    expect(titleOf(vc)).toBe(exampleSubmission.title);
    expect(slugOf(vc)).toBe('the-slug');
    const { work, review } = evidenceOf(vc);
    expect(work.map((e) => e.name)).toEqual(['Review of #1', 'Review of pull request #2']);
    expect(review?.description).toContain('Approved by @maintainer-a and @maintainer-b, each of whom declared no conflict of interest.');
    expect(reviewParticipants(review?.description)).toEqual({
      submittedBy: 'example-reviewer',
      approvedBy: ['maintainer-a', 'maintainer-b'],
      mergedBy: 'maintainer-a',
      declaredNoConflict: true,
    });
  });

  it('re-homes a credential to a new site address without changing its content', async () => {
    // A credential signed when the site lived at another address.
    const old = 'https://old.example/awards';
    const original = JSON.parse(
      JSON.stringify(await sign(buildCredential('x', exampleSubmission, exampleRecord), { secretKeyMultibase: generateKeyPair().secretKeyMultibase, verificationMethod: verificationMethodId('key-1') }))
        .split(SITE_URL).join(old)
        .split(ISSUER_DID).join('did:web:old.example:awards'),
    ) as OpenBadgeCredential;
    const moved = rehomeCredential(original, SITE_URL) as unknown as OpenBadgeCredential;
    expect('proof' in moved).toBe(false);
    expect(moved.issuer.id).toBe(ISSUER_DID);
    expect(moved.id).toBe(`${SITE_URL}/credentials/x.json`);
    expect(JSON.stringify(moved)).not.toContain(old);
    // Everything that is not about where the site lives is unchanged.
    expect(moved.validFrom).toBe(original.validFrom);
    expect(moved.credentialSubject.narrative).toBe(original.credentialSubject.narrative);
    expect(moved.evidence).toEqual(original.evidence);
    expect(moved.name).toBe(original.name);
  });

  it('reads review records with full names, including names with full stops', () => {
    expect(reviewParticipants('Submitted by @x. Approved by A. N. Example (@a-n), Bo (@bo), who declared no conflict of interest. Merged by A. N. Example (@a-n).')).toEqual({
      submittedBy: 'x',
      approvedBy: ['a-n', 'bo'],
      mergedBy: 'a-n',
      declaredNoConflict: true,
    });
  });

  it('names collaborators in the description', () => {
    const vc = buildCredential('x', { ...exampleSubmission, collaborators: [{ github: 'b', name: 'Bea Two' }] }, exampleRecord);
    expect(vc.description).toContain('joint work with Bea Two');
  });
});
