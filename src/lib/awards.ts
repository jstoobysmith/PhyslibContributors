/**
 * The index of awards that the site reads (public/data/awards.json), and the
 * ways an award is referred to: its number, citation and LinkedIn entry.
 */
import { SITE, sectionById, urls } from './config';
import { evidenceOf, recipientOf, sectionIdOf, titleOf, type OpenBadgeCredential } from './credential';
import type { Submission } from './submission';

export interface AwardEntry {
  slug: string;
  /** Permanent running number, assigned when the award is first signed (data/award-numbers.json). */
  number: number;
  year: number;
  section: string;
  title: string;
  summary: string;
  recipient: { name: string; github?: string; orcid?: string };
  collaborators?: { name: string; github: string }[];
  acceptedAt: string;
  submittedAt?: string;
  evidenceCount: number;
  revoked: boolean;
}

/** Merged submissions that have not been signed yet. */
export interface PendingEntry {
  slug: string;
  section: string;
  title: string;
  recipient: { name: string; github: string };
  submittedAt: string;
}

export interface AwardsIndex {
  generatedAt: string;
  /** Newest first. */
  published: AwardEntry[];
  pending: PendingEntry[];
}

/** Award numbers by slug. Numbers are never reused or changed. */
export type AwardNumbers = Record<string, number>;

export function nextAwardNumber(numbers: AwardNumbers): number {
  return Math.max(0, ...Object.values(numbers)) + 1;
}

export function buildAwardsIndex(
  credentials: { slug: string; credential: OpenBadgeCredential }[],
  submissions: Map<string, Submission>,
  numbers: AwardNumbers,
  revokedIds: string[],
): AwardsIndex {
  const published = credentials
    .map(({ slug, credential }): AwardEntry => {
      const submission = submissions.get(slug);
      const number = numbers[slug];
      if (!number) throw new Error(`No award number for ${slug} in data/award-numbers.json`);
      return {
        slug,
        number,
        year: Number(credential.validFrom.slice(0, 4)),
        section: sectionIdOf(credential),
        title: titleOf(credential),
        summary: credential.credentialSubject.narrative ?? '',
        recipient: recipientOf(credential),
        collaborators: submission?.collaborators,
        acceptedAt: credential.validFrom,
        submittedAt: submission?.submittedAt,
        evidenceCount: evidenceOf(credential).work.length,
        revoked: revokedIds.includes(credential.id),
      };
    })
    .sort((a, b) => b.number - a.number);

  const signed = new Set(published.map((p) => p.slug));
  const pending = [...submissions]
    .filter(([slug]) => !signed.has(slug))
    .map(([slug, s]) => ({
      slug,
      section: s.section,
      title: s.title,
      recipient: { name: s.recipient.name, github: s.recipient.github },
      submittedAt: s.submittedAt,
    }));

  return { generatedAt: new Date().toISOString(), published, pending };
}

/** Short reference to an award, e.g. "Physlib Contributions award no. 3 (2026)". */
export function awardReference(e: Pick<AwardEntry, 'number' | 'year'>) {
  return `${SITE.title} award no. ${e.number} (${e.year})`;
}

export function citationKey(e: Pick<AwardEntry, 'recipient' | 'year' | 'number'>) {
  const who = (e.recipient.github ?? e.recipient.name).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `physlib${e.year}-${who}-${e.number}`;
}

/** A line the recipient can put on a CV. */
export function cvLine(c: OpenBadgeCredential, slug: string, entry?: AwardEntry) {
  const year = c.validFrom.slice(0, 4);
  return `${c.credentialSubject.achievement.name} (${year}) for “${titleOf(c)}”, ${SITE.title}${entry ? `, award no. ${entry.number}` : ''}. ${urls.award(slug)}`;
}

export function citations(c: OpenBadgeCredential, slug: string, entry?: AwardEntry) {
  const r = recipientOf(c);
  const title = titleOf(c);
  const year = c.validFrom.slice(0, 4);
  const ref = entry ? awardReference(entry) : `${SITE.title} (${year})`;
  const text = `${r.name}, “${title},” ${ref}. ${c.credentialSubject.achievement.name}. ${urls.award(slug)}`;
  const bibtex = `@misc{${entry ? citationKey(entry) : `physlib${year}-${slug}`},
  author       = {${r.name}},
  title        = {{${title}}},
  howpublished = {${SITE.title}${entry ? `, award no. ${entry.number}` : ''}},
  note         = {${c.credentialSubject.achievement.name}. Open Badges 3.0 credential},
  year         = {${year}},
  url          = {${urls.award(slug)}}
}`;
  return { text, bibtex };
}

export function linkedInUrl(c: OpenBadgeCredential, slug: string) {
  const d = new Date(c.validFrom);
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: c.credentialSubject.achievement.name,
    organizationName: SITE.issuer.name,
    issueYear: String(d.getUTCFullYear()),
    issueMonth: String(d.getUTCMonth() + 1),
    certUrl: urls.award(slug),
    certId: c.id,
  });
  return `https://www.linkedin.com/profile/add?${params}`;
}

/** One plain sentence on what the award certifies, for readers outside the field. */
export function whatItMeans(c: OpenBadgeCredential) {
  const section = sectionById(sectionIdOf(c));
  return `This award records that the maintainers of ${SITE.title} checked the evidence above and agreed that it meets the published criteria for ${
    section ? `the ${section.name} section` : 'this award'
  }. Physlib is an open-source library of physics formalised in the Lean 4 proof assistant.`;
}
