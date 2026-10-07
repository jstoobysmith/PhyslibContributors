import { didWebBaseUrl, EVIDENCE_KINDS, ISSUER_DID, maintainerByLogin, SITE, sectionById, urls, type Section } from './config';
import { evidenceTitle, type Submission } from './submission';
import type { DataIntegrityProof, JsonObject } from './dataIntegrity';

export const OB_CONTEXT = [
  'https://www.w3.org/ns/credentials/v2',
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
];

/** Wording used in review records; read back by reviewParticipants. */
const DECLARED_NO_CONFLICT = 'declared no conflict of interest';

/** Evidence genre of the pull request in which an award was reviewed and accepted. */
export const REVIEW_GENRE = 'Maintainer review';

/** The review record of a submission, taken from its merged pull request. */
export interface ReviewRecord {
  pullRequest?: { number: number; url: string; author?: string };
  reviewers?: string[];
  mergedBy?: string;
  acceptedAt: string;
}

export function issuerProfile() {
  return {
    id: ISSUER_DID,
    type: ['Profile'],
    name: SITE.issuer.name,
    url: SITE.issuer.url,
    description: SITE.issuer.description,
    image: { id: urls.issuerImage(), type: 'Image' },
  };
}

export function achievement(section: Section) {
  return {
    id: urls.achievement(section.id),
    type: ['Achievement'],
    achievementType: 'Award',
    name: section.awardName,
    description: section.description,
    criteria: {
      id: urls.section(section.id),
      narrative: section.criteria.map((c) => `- ${c}`).join('\n'),
    },
    image: { id: urls.badgeImage(section.id), type: 'Image', caption: `${section.awardName} badge` },
    creator: issuerProfile(),
    tag: ['Physlib', 'Lean 4', 'formalization', section.name],
  };
}

/** First and last day of a "YYYY-MM" month, as OB 3.0 date-times. */
const monthStart = (m: string) => `${m}-01T00:00:00Z`;
const monthEnd = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}T00:00:00Z`;
};

export function buildCredential(slug: string, submission: Submission, record: ReviewRecord): JsonObject {
  const section = sectionById(submission.section);
  if (!section) throw new Error(`Unknown section ${submission.section}`);
  const { recipient } = submission;

  const identifier: JsonObject[] = [
    { type: 'IdentityObject', identityType: 'name', identityHash: recipient.name, hashed: false },
    { type: 'IdentityObject', identityType: 'ext:GitHubUsername', identityHash: recipient.github, hashed: false },
  ];
  if (recipient.orcid) {
    identifier.push({ type: 'IdentityObject', identityType: 'ext:ORCID', identityHash: recipient.orcid, hashed: false });
  }

  const evidence: JsonObject[] = submission.evidence.map((e) => ({
    id: e.url,
    type: ['Evidence'],
    name: evidenceTitle(e),
    ...(e.description ? { description: e.description } : {}),
    genre: EVIDENCE_KINDS[e.kind],
  }));

  if (record.pullRequest) {
    // Names are recorded at signing time, so the award stays readable if the maintainer list changes.
    const who = (login: string) => (maintainerByLogin(login) ? `${maintainerByLogin(login)!.name} (@${login})` : `@${login}`);
    const names = (record.reviewers ?? []).map(who);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    const reviewers = names.length
      ? `Approved by ${list}, ${names.length > 1 ? 'each of whom' : 'who'} ${DECLARED_NO_CONFLICT}. `
      : '';
    const merged = record.mergedBy ? `Merged by ${who(record.mergedBy)}. ` : '';
    const author = record.pullRequest.author ? `Submitted by @${record.pullRequest.author}. ` : '';
    evidence.push({
      id: record.pullRequest.url,
      type: ['Evidence'],
      name: `Review of the submission: pull request #${record.pullRequest.number}`,
      description: `${author}${reviewers}${merged}`.trim() || 'Pull request in which this award was reviewed and accepted.',
      genre: REVIEW_GENRE,
    });
  }

  return {
    '@context': OB_CONTEXT,
    id: urls.credential(slug),
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    name: `${section.awardName}: ${submission.title}`,
    description:
      `${recipient.name} received the ${section.awardName} from ${SITE.issuer.name} for “${submission.title}”` +
      (submission.collaborators?.length ? `, joint work with ${submission.collaborators.map((c) => c.name).join(', ')}.` : '.'),
    issuer: issuerProfile(),
    validFrom: record.acceptedAt,
    awardedDate: record.acceptedAt,
    credentialSubject: {
      type: ['AchievementSubject'],
      identifier,
      narrative: submission.summary,
      ...(submission.period
        ? {
            activityStartDate: monthStart(submission.period.from),
            activityEndDate: monthEnd(submission.period.to),
          }
        : {}),
      achievement: achievement(section),
    },
    evidence,
    // No `credentialSchema`: its type `1EdTechJsonSchemaValidator2019` is not defined in any
    // JSON-LD context, so strict (safe-mode) verifiers reject credentials that include it.
    // The credential is still checked against the 1EdTech schema in test/credential.test.ts.
  };
}

// --- Reading credentials back (used by the site) ----------------------------

export interface OpenBadgeCredential {
  '@context': string[];
  id: string;
  type: string[];
  name: string;
  description?: string;
  issuer: { id: string; name: string; url?: string };
  validFrom: string;
  validUntil?: string;
  awardedDate?: string;
  credentialSubject: {
    identifier?: { identityType: string; identityHash: string }[];
    narrative?: string;
    activityStartDate?: string;
    activityEndDate?: string;
    achievement: {
      id: string;
      name: string;
      description: string;
      criteria: { id?: string; narrative?: string };
      image?: { id: string };
    };
  };
  evidence?: { id?: string; name?: string; description?: string; genre?: string }[];
  proof?: DataIntegrityProof;
}

export function recipientOf(c: OpenBadgeCredential) {
  const get = (t: string) => c.credentialSubject.identifier?.find((i) => i.identityType === t)?.identityHash;
  return { name: get('name') ?? 'Unknown', github: get('ext:GitHubUsername'), orcid: get('ext:ORCID') };
}

export const sectionIdOf = (c: OpenBadgeCredential) => c.credentialSubject.achievement.id.split('/').pop()!.replace(/\.json$/, '');

/** The award title, without the award name that prefixes the credential name. */
export const titleOf = (c: OpenBadgeCredential) => c.name.replace(`${c.credentialSubject.achievement.name}: `, '');

/** The slug of one of our credentials, from its id. */
export const slugOf = (c: Pick<OpenBadgeCredential, 'id'>) => c.id.split('/').pop()!.replace(/\.json$/, '');

/** The evidence that makes up the work, and the separate record of how the award was reviewed. */
export function evidenceOf(c: OpenBadgeCredential) {
  const all = c.evidence ?? [];
  return { work: all.filter((e) => e.genre !== REVIEW_GENRE), review: all.find((e) => e.genre === REVIEW_GENRE) };
}

/**
 * GitHub logins mentioned in a review record, e.g. "Submitted by @x. Approved by
 * Ada Example (@a), who declared no conflict of interest. Merged by @c."
 */
export function reviewParticipants(description = '') {
  const LOGIN = /@([A-Za-z0-9-]+)/g;
  const after = (label: string) => description.split(label)[1] ?? '';
  const first = (label: string) => [...after(label).matchAll(LOGIN)][0]?.[1];
  const approved = after('Approved by ').split(/(?:each of whom|who) declared|Merged by|Submitted by/)[0];
  return {
    submittedBy: first('Submitted by '),
    approvedBy: [...approved.matchAll(LOGIN)].map((m) => m[1]),
    mergedBy: first('Merged by '),
    declaredNoConflict: description.includes(DECLARED_NO_CONFLICT),
  };
}

/**
 * A signed credential, unsigned and moved to the current site: for re-signing
 * after a key rotation or a move to a new address. The content is unchanged;
 * only the issuer profile and the credential's own URLs under the old site
 * address change (the summary and evidence are left exactly as they were).
 */
export function rehomeCredential(credential: OpenBadgeCredential, siteUrl: string): JsonObject {
  const { proof: _old, ...body } = credential;
  const oldBase = didWebBaseUrl(credential.issuer.id);
  const move = (url?: string) => (url?.startsWith(oldBase + '/') ? siteUrl + url.slice(oldBase.length) : url);
  const moved = structuredClone(body) as unknown as OpenBadgeCredential & JsonObject;
  moved.id = move(moved.id)!;
  const a = moved.credentialSubject.achievement as OpenBadgeCredential['credentialSubject']['achievement'] & JsonObject;
  a.id = move(a.id)!;
  if (a.criteria) a.criteria.id = move(a.criteria.id);
  if (a.image) a.image.id = move(a.image.id)!;
  a.creator = issuerProfile();
  (moved as JsonObject).issuer = issuerProfile();
  return moved;
}
