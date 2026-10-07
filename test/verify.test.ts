import { describe, expect, it, vi } from 'vitest';
import { buildCredential } from '../src/lib/credential';
import { generateKeyPair, sign } from '../src/lib/dataIntegrity';
import { ISSUER_DID, verificationMethodId } from '../src/lib/config';
import { checkDnsAnchor, dnsCheck, dnsRecordFor, parseDnsRecord, verifyCredential } from '../src/lib/verify';
import { exampleRecord, exampleSubmission } from './fixtures/example';

const keys = generateKeyPair();
const vmId = verificationMethodId('key-1');
const didDoc = {
  id: ISSUER_DID,
  verificationMethod: [{ id: vmId, type: 'Multikey', controller: ISSUER_DID, publicKeyMultibase: keys.publicKeyMultibase }],
  assertionMethod: [vmId],
};
const resolveDid = async () => didDoc;
const signed = () => sign(buildCredential('x', exampleSubmission, exampleRecord), { secretKeyMultibase: keys.secretKeyMultibase, verificationMethod: vmId });

describe('verifyCredential', () => {
  it('accepts a genuine credential', async () => {
    const r = await verifyCredential(await signed(), { resolveDid, revoked: [], trustedIssuers: [ISSUER_DID] });
    expect(r.checks.filter((c) => c.status !== 'pass')).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('rejects a key not authorised by the issuer DID', async () => {
    const vc = await sign(buildCredential('x', exampleSubmission, exampleRecord), { secretKeyMultibase: generateKeyPair().secretKeyMultibase, verificationMethod: vmId });
    const r = await verifyCredential(vc, { resolveDid });
    expect(r.valid).toBe(false);
    expect(r.checks.find((c) => c.id === 'signature')?.status).toBe('fail');
  });

  it('rejects a credential claiming a different issuer', async () => {
    const vc = await signed();
    const r = await verifyCredential({ ...vc, issuer: { ...(vc.issuer as object), id: 'did:web:evil.example' } }, { resolveDid });
    expect(r.valid).toBe(false);
  });

  it('rejects a genuinely signed credential from an issuer that is not trusted', async () => {
    // A forger hosts their own DID document and calls themselves "Physlib".
    const forger = generateKeyPair();
    const did = 'did:web:evil.example';
    const vc = await sign(
      { ...buildCredential('x', exampleSubmission, exampleRecord), issuer: { id: did, type: ['Profile'], name: 'Physlib' } },
      { secretKeyMultibase: forger.secretKeyMultibase, verificationMethod: `${did}#key-1` },
    );
    const forgerDoc = { id: did, verificationMethod: [{ id: `${did}#key-1`, type: 'Multikey', controller: did, publicKeyMultibase: forger.publicKeyMultibase }], assertionMethod: [`${did}#key-1`] };
    expect((await verifyCredential(vc, { resolveDid: async () => forgerDoc })).valid).toBe(true);
    const r = await verifyCredential(vc, { resolveDid: async () => forgerDoc, trustedIssuers: [ISSUER_DID] });
    expect(r.valid).toBe(false);
    expect(r.checks.at(-1)?.id).toBe('issuer');
  });

  it('rejects revoked and not-yet-valid credentials', async () => {
    const vc = await signed();
    expect((await verifyCredential(vc, { resolveDid, revoked: [vc.id as string] })).valid).toBe(false);
    expect((await verifyCredential(vc, { resolveDid, now: new Date('2020-01-01') })).valid).toBe(false);
  });
});

describe('DNS anchor', () => {
  it('round-trips the TXT record format', () => {
    expect(parseDnsRecord(dnsRecordFor(ISSUER_DID, 'z6MkTest'))).toEqual({ v: 'OB3', did: ISSUER_DID, key: 'z6MkTest' });
  });

  it('distinguishes a matching, different and missing record', async () => {
    const answer = (data: string[]) =>
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ Answer: data.map((d) => ({ type: 16, data: `"${d}"` })) })));
    answer([dnsRecordFor(ISSUER_DID, 'z6MkA')]);
    expect((await checkDnsAnchor('z6MkA')).status).toBe('match');
    answer([dnsRecordFor(ISSUER_DID, 'z6MkB')]);
    expect((await checkDnsAnchor('z6MkA')).status).toBe('mismatch');
    answer(['v=spf1 -all']);
    expect((await checkDnsAnchor('z6MkA')).status).toBe('absent');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
    expect((await checkDnsAnchor('z6MkA')).status).toBe('error');
  });

  it('treats a mismatch as a failure but a missing record as information', () => {
    expect(dnsCheck({ status: 'mismatch', records: [] }).status).toBe('fail');
    expect(dnsCheck({ status: 'absent' }, 'temporary').status).toBe('info');
  });
});
