import { SITE, didWebDocumentUrl, type KeyStatus } from './config';
import type { DataIntegrityProof, JsonObject } from './dataIntegrity';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'info';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface VerificationResult {
  valid: boolean;
  checks: Check[];
  publicKeyMultibase?: string;
}

interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase: string;
}

interface DidDocument {
  id: string;
  verificationMethod?: VerificationMethod[];
  assertionMethod?: (string | VerificationMethod)[];
}

export interface VerifyOptions {
  /** Override DID resolution (tests, offline CLI use). */
  resolveDid?: (did: string) => Promise<DidDocument>;
  /** Credential ids that the issuer has revoked. Omit to skip the check. */
  revoked?: string[];
  /**
   * Issuers whose reports count as genuine here. Anyone can sign a credential with
   * their own key and give the issuer any name, so a valid signature alone only
   * shows who signed it. Omit to accept any issuer.
   */
  trustedIssuers?: string[];
  now?: Date;
}

export async function resolveDidWeb(did: string): Promise<DidDocument> {
  const res = await fetch(didWebDocumentUrl(did), { headers: { Accept: 'application/did+json, application/json' } });
  if (!res.ok) throw new Error(`Could not fetch DID document for ${did} (HTTP ${res.status})`);
  return (await res.json()) as DidDocument;
}

const absolute = (did: string, ref: string) => (ref.startsWith('#') ? did + ref : ref);

export async function verifyCredential(credential: JsonObject, opts: VerifyOptions = {}): Promise<VerificationResult> {
  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail });
  const done = (publicKeyMultibase?: string): VerificationResult => ({
    valid: checks.every((c) => c.status !== 'fail'),
    checks,
    publicKeyMultibase,
  });

  // 1. Is this an Open Badges 3.0 credential?
  const types = credential.type as string[] | undefined;
  const contexts = credential['@context'] as string[] | undefined;
  const isOb3 =
    Array.isArray(types) &&
    types.includes('VerifiableCredential') &&
    (types.includes('OpenBadgeCredential') || types.includes('AchievementCredential')) &&
    Array.isArray(contexts) &&
    contexts.some((c) => typeof c === 'string' && c.startsWith('https://purl.imsglobal.org/spec/ob/v3p0/context'));
  add(
    'format',
    'Open Badges 3.0 credential',
    isOb3 ? 'pass' : 'fail',
    isOb3 ? 'Typed as a VerifiableCredential / OpenBadgeCredential with the OB 3.0 context.' : 'Missing the OB 3.0 type or context.',
  );
  if (!isOb3) return done();

  // 2. Proof and issuer binding.
  const proof = credential.proof as DataIntegrityProof | undefined;
  if (!proof || typeof proof.verificationMethod !== 'string') {
    add('proof', 'Embedded proof', 'fail', 'The credential is not signed.');
    return done();
  }
  const issuer = credential.issuer as { id?: string } | string;
  const issuerId = typeof issuer === 'string' ? issuer : issuer?.id;
  const [did] = proof.verificationMethod.split('#');
  if (issuerId !== did) {
    add('issuer', 'Signed by the issuer', 'fail', `Signed with a key of ${did}, but the issuer is ${issuerId}.`);
    return done();
  }
  if (opts.trustedIssuers && !opts.trustedIssuers.includes(did)) {
    add('issuer', `Issued by ${SITE.issuer.name}`, 'fail', `This credential was issued by ${did}, not by ${SITE.issuer.name}.`);
    return done();
  }

  // 3. Resolve the issuer's DID and find the key.
  let doc: DidDocument;
  try {
    doc = await (opts.resolveDid ?? resolveDidWeb)(did);
  } catch (e) {
    add('did', 'Issuer key published', 'fail', (e as Error).message);
    return done();
  }
  const vm = doc.verificationMethod?.find((m) => absolute(did, m.id) === proof.verificationMethod);
  const authorised = doc.assertionMethod?.some(
    (a) => absolute(did, typeof a === 'string' ? a : a.id) === proof.verificationMethod,
  );
  if (!vm || !authorised || doc.id !== did || vm.controller !== did) {
    add('did', 'Issuer key published', 'fail', `${proof.verificationMethod} is not an assertion key in the DID document of ${did}.`);
    return done();
  }
  add('did', 'Issuer key published', 'pass', `Key ${proof.verificationMethod.split('#')[1]} is listed for ${did}.`);

  // 4. The signature itself.
  try {
    // Loaded on demand: JSON-LD canonicalization is most of the site's JavaScript.
    const { verifySignature } = await import('./dataIntegrity');
    const ok = await verifySignature(credential, vm.publicKeyMultibase);
    add(
      'signature',
      'Signature (eddsa-rdfc-2022)',
      ok ? 'pass' : 'fail',
      ok
        ? 'The content is exactly what the issuer signed.'
        : 'The signature does not match: the credential has been altered, or was signed with a different key.',
    );
  } catch (e) {
    add('signature', 'Signature (eddsa-rdfc-2022)', 'fail', (e as Error).message);
  }

  // 5. Validity period.
  const now = opts.now ?? new Date();
  const validFrom = new Date(credential.validFrom as string);
  const validUntil = credential.validUntil ? new Date(credential.validUntil as string) : null;
  if (Number.isNaN(validFrom.getTime()) || validFrom > now) {
    add('dates', 'Validity period', 'fail', 'The credential is not yet valid.');
  } else if (validUntil && validUntil < now) {
    add('dates', 'Validity period', 'fail', `Expired on ${validUntil.toISOString().slice(0, 10)}.`);
  } else {
    add('dates', 'Validity period', 'pass', `Valid since ${validFrom.toISOString().slice(0, 10)}${validUntil ? '' : ', does not expire'}.`);
  }

  // 6. Revocation.
  if (opts.revoked) {
    const revoked = opts.revoked.includes(credential.id as string);
    add(
      'revocation',
      'Not revoked',
      revoked ? 'fail' : 'pass',
      revoked ? 'The issuer has revoked this report.' : 'Not on the revocation list published on this site.',
    );
  }

  return done(vm.publicKeyMultibase);
}

// --- DNS anchor ------------------------------------------------------------------

export type DnsStatus =
  | { status: 'match'; record: string }
  | { status: 'mismatch'; records: string[] }
  | { status: 'absent' }
  | { status: 'error'; message: string };

/** Parses `v=OB3; did=...; key=z6Mk...` TXT records. */
export function parseDnsRecord(txt: string): Record<string, string> {
  return Object.fromEntries(
    txt
      .split(';')
      .map((p) => p.trim().split('='))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k.trim().toLowerCase(), v.trim()]),
  );
}

export function dnsRecordFor(did: string, publicKeyMultibase: string): string {
  return `v=OB3; did=${did}; key=${publicKeyMultibase}`;
}

/**
 * Looks up the issuer's TXT record over DNS-over-HTTPS, so that anyone can
 * check that whoever controls physlib.io vouches for the signing key.
 */
export async function checkDnsAnchor(publicKeyMultibase: string, name = SITE.dns.txtName): Promise<DnsStatus> {
  try {
    const url = `${SITE.dns.dohResolver}?name=${encodeURIComponent(name)}&type=TXT`;
    const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
    if (!res.ok) return { status: 'error', message: `DNS lookup failed (HTTP ${res.status})` };
    const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
    const records = (body.Answer ?? [])
      .filter((a) => a.type === 16)
      .map((a) => a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
    const ours = records.filter((r) => parseDnsRecord(r).v === 'OB3');
    if (ours.length === 0) return { status: 'absent' };
    const match = ours.find((r) => parseDnsRecord(r).key === publicKeyMultibase);
    return match ? { status: 'match', record: match } : { status: 'mismatch', records: ours };
  } catch (e) {
    return { status: 'error', message: (e as Error).message };
  }
}

/** A readable check line for the DNS anchor. A mismatch is a failure; absence is not. */
export function dnsCheck(dns: DnsStatus | undefined, keyStatus?: KeyStatus): Check {
  const label = `Key published in the DNS of ${SITE.dns.txtName.replace(/^_[^.]+\./, '')}`;
  if (!dns) return { id: 'dns', label, status: 'info', detail: 'Looking up the DNS record…' };
  switch (dns.status) {
    case 'match':
      return { id: 'dns', label, status: 'pass', detail: `The TXT record at ${SITE.dns.txtName} names this key.` };
    case 'mismatch':
      return { id: 'dns', label, status: 'fail', detail: `The TXT record at ${SITE.dns.txtName} names a different key.` };
    case 'absent':
      return {
        id: 'dns',
        label,
        status: 'info',
        detail:
          keyStatus === 'temporary'
            ? 'Not yet: this key is temporary, and only the permanent key will be published in the DNS.'
            : `No record found at ${SITE.dns.txtName}.`,
      };
    case 'error':
      return { id: 'dns', label, status: 'info', detail: `The DNS lookup did not complete (${dns.message}).` };
  }
}
