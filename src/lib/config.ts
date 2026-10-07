/**
 * Typed access to config/*.json. Shared by the site (browser) and the scripts (Node).
 */
import site from '../../config/site.json';
import sectionsJson from '../../config/sections.json';
import keysJson from '../../config/keys.json';
import maintainersJson from '../../config/maintainers.json';

/**
 * active/temporary: signs new reports. retired: no longer signs, but reports it
 * signed still verify. revoked: compromised; removed from the DID document so
 * nothing it signed verifies.
 */
export type KeyStatus = 'active' | 'temporary' | 'retired' | 'revoked';

export interface KeyConfig {
  id: string;
  publicKeyMultibase: string;
  status: KeyStatus;
}

export const SECTION_IDS = ['review', 'maintenance', 'refactoring', 'foundations', 'test'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const EVIDENCE_KINDS = {
  'pull-request': 'Pull request',
  'pull-request-review': 'Pull request review',
  commit: 'Commit',
  issue: 'Issue',
  module: 'Lean module',
  'zulip-thread': 'Zulip thread',
  other: 'Other',
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_KINDS;

export interface Section {
  id: SectionId;
  /** Roman numeral shown before the name, e.g. "IV". */
  numeral: string;
  name: string;
  reportName: string;
  /** One sentence, for lists. */
  summary: string;
  description: string;
  criteria: string[];
  /** Rough indication of the amount of work one report covers. */
  guidance: string;
  evidenceKinds: EvidenceKind[];
  /**
   * The test section: for trying out the form, the review and the signing.
   * Its reports are signed like any other, but marked as tests, not numbered
   * and not listed with real reports.
   */
  test?: boolean;
}

/** An entry of config/revocations.json. */
export interface Revocation {
  id: string;
  reason?: string;
  date?: string;
}

export interface Maintainer {
  github: string;
  /** Numeric GitHub user id. When given, approvals must come from this account even if its login changes hands. */
  id?: number;
  name: string;
  affiliation?: string;
  role?: string;
}

export const SITE = site;
/** Every section, including the test section. */
export const ALL_SECTIONS = sectionsJson as Section[];
/** The sections of real reports, as listed on the site. */
export const SECTIONS = ALL_SECTIONS.filter((s) => !s.test);
export const TEST_SECTION = ALL_SECTIONS.find((s) => s.test);
export const KEYS = keysJson as KeyConfig[];
export const MAINTAINERS = maintainersJson as Maintainer[];

export function sectionById(id: string): Section | undefined {
  return ALL_SECTIONS.find((s) => s.id === id);
}

/** Whether a section id is the test section's. */
export const isTestSection = (id: string) => !!sectionById(id)?.test;

export function maintainerByLogin(login: string): Maintainer | undefined {
  return MAINTAINERS.find((m) => m.github.toLowerCase() === login.toLowerCase());
}

/** The listed maintainer behind a GitHub account, matching the numeric id when one is configured. */
export function maintainerOf(user: { login: string; id?: number }): Maintainer | undefined {
  const m = maintainerByLogin(user.login);
  return m && (m.id === undefined || m.id === user.id) ? m : undefined;
}

/** Whether a key with this status may sign new reports. */
export const canSign = (status: KeyStatus) => status === 'active' || status === 'temporary';

/** The key that signs new reports (the newest key that may sign). */
export const SIGNING_KEY = [...KEYS].reverse().find((k) => canSign(k.status));

/** An ISO 8601 timestamp to the second, as used in credentials. */
export const isoSeconds = (d: string | Date = new Date()) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Site URL without a trailing slash. */
export const SITE_URL = site.siteUrl.replace(/\/$/, '');

/**
 * The issuer is identified by a did:web DID derived from the site URL, so the
 * key material is published by whoever controls the site:
 *   https://example.org            -> did:web:example.org            (/.well-known/did.json)
 *   https://example.org/reports     -> did:web:example.org:reports     (/reports/did.json)
 */
export function didWebFromUrl(url: string): string {
  const u = new URL(url);
  const host = encodeURIComponent(u.host); // percent-encodes a port colon
  const path = u.pathname.split('/').filter(Boolean).map(encodeURIComponent);
  return ['did:web', host, ...path].join(':');
}

export function didWebDocumentUrl(did: string): string {
  const parts = did.split(':');
  if (parts[0] !== 'did' || parts[1] !== 'web' || parts.length < 3) {
    throw new Error(`Not a did:web DID: ${did}`);
  }
  const [host, ...path] = parts.slice(2).map(decodeURIComponent);
  return path.length === 0
    ? `https://${host}/.well-known/did.json`
    : `https://${host}/${path.join('/')}/did.json`;
}

/** The site URL a did:web DID points to (the inverse of didWebFromUrl). */
export function didWebBaseUrl(did: string): string {
  return didWebDocumentUrl(did).replace(/\/(\.well-known\/)?did\.json$/, '');
}

export const ISSUER_DID = didWebFromUrl(SITE_URL);

export function verificationMethodId(keyId: string): string {
  return `${ISSUER_DID}#${keyId}`;
}

/**
 * The issuer's DID document (published as did.json): every key that may have
 * signed a report, except revoked ones, so reports signed with a retired key
 * keep verifying.
 */
export function issuerDidDocument() {
  const keys = KEYS.filter((k) => k.status !== 'revoked');
  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
    id: ISSUER_DID,
    verificationMethod: keys.map((k) => ({
      id: verificationMethodId(k.id),
      type: 'Multikey',
      controller: ISSUER_DID,
      publicKeyMultibase: k.publicKeyMultibase,
    })),
    assertionMethod: keys.map((k) => verificationMethodId(k.id)),
  };
}

/** The sample report shown before any real report exists. It is not listed with real reports. */
export const SPECIMEN_SLUG = 'specimen';

/** Path of a credential file, relative to the site root (and to public/). */
export function credentialFile(slug: string): string {
  return slug === SPECIMEN_SLUG ? 'specimen.json' : `credentials/${slug}.json`;
}

/** GitHub conventions for submission pull requests (the label is also used by .github/workflows/submission-summary.yml). */
export const SUBMISSION_LABEL = 'submission';
export const SUBMISSION_BRANCH_PREFIX = 'submission/';
export const SUBMISSION_TITLE_PREFIX = 'Submission: ';

export const urls = {
  credential: (slug: string) => `${SITE_URL}/${credentialFile(slug)}`,
  report: (slug: string) => `${SITE_URL}/reports/${slug}`,
  achievement: (sectionId: string) => `${SITE_URL}/achievements/${sectionId}.json`,
  badgeImage: (sectionId: string) => `${SITE_URL}/badges/${sectionId}.svg`,
  section: (sectionId: string) => `${SITE_URL}/sections/${sectionId}`,
  issuerImage: () => `${SITE_URL}/${site.issuer.image}`,
  submissionSchema: () => `${SITE_URL}/schemas/submission.schema.json`,
  repo: () => `https://github.com/${site.repository.owner}/${site.repository.name}`,
  physlibRepo: () => `https://github.com/${site.physlib.repository}`,
  goodFirstIssues: () => `https://github.com/${site.physlib.repository}/issues?q=is%3Aopen+label%3A%22good+first+issue%22`,
  github: (login: string) => `https://github.com/${login}`,
};
