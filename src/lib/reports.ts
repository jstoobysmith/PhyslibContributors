/**
 * The index of reports that the site reads (public/data/reports.json), and the
 * ways a report is referred to: its number, citation and LinkedIn entry.
 */
import { isTestSection, sectionById, SITE, urls } from './config';
import { evidenceOf, recipientOf, sectionIdOf, titleOf, type OpenBadgeCredential } from './credential';
import type { Submission } from './submission';

export interface ReportEntry {
  slug: string;
  /** Permanent running number, assigned when the report is first signed (data/report-numbers.json). */
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

/** A submission to the test section, signed or not. Test reports are not numbered or listed with real reports. */
export interface TestEntry {
  slug: string;
  title: string;
  recipient: { name: string; github?: string };
  signed: boolean;
}

export interface ReportsIndex {
  generatedAt: string;
  /** Newest first. */
  published: ReportEntry[];
  pending: PendingEntry[];
  tests: TestEntry[];
}

/** Report numbers by slug. Numbers are never reused or changed. */
export type ReportNumbers = Record<string, number>;

export function nextReportNumber(numbers: ReportNumbers): number {
  return Math.max(0, ...Object.values(numbers)) + 1;
}

export function buildReportsIndex(
  credentials: { slug: string; credential: OpenBadgeCredential }[],
  submissions: Map<string, Submission>,
  numbers: ReportNumbers,
  revokedIds: string[],
): ReportsIndex {
  const isTest = (c: OpenBadgeCredential) => isTestSection(sectionIdOf(c));
  const published = credentials
    .filter(({ credential }) => !isTest(credential))
    .map(({ slug, credential }): ReportEntry => {
      const submission = submissions.get(slug);
      const number = numbers[slug];
      if (!number) throw new Error(`No report number for ${slug} in data/report-numbers.json`);
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

  const signed = new Set(credentials.map((c) => c.slug));
  const pending = [...submissions]
    .filter(([slug, s]) => !signed.has(slug) && !isTestSection(s.section))
    .map(([slug, s]) => ({
      slug,
      section: s.section,
      title: s.title,
      recipient: { name: s.recipient.name, github: s.recipient.github },
      submittedAt: s.submittedAt,
    }));

  const tests: TestEntry[] = [
    ...credentials.filter(({ credential }) => isTest(credential)).map(({ slug, credential }) => ({ slug, title: titleOf(credential), recipient: recipientOf(credential), signed: true })),
    ...[...submissions]
      .filter(([slug, s]) => !signed.has(slug) && isTestSection(s.section))
      .map(([slug, s]) => ({ slug, title: s.title, recipient: { name: s.recipient.name, github: s.recipient.github }, signed: false })),
  ];

  return { generatedAt: new Date().toISOString(), published, pending, tests };
}

/** Short reference to a report, e.g. "Physlib Contribution Report no. 3 (2026)". */
export function reportReference(e: Pick<ReportEntry, 'number' | 'year'>) {
  return `${SITE.reportSeries} no. ${e.number} (${e.year})`;
}

export function citationKey(e: Pick<ReportEntry, 'recipient' | 'year' | 'number'>) {
  const who = (e.recipient.github ?? e.recipient.name).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `physlib${e.year}-${who}-${e.number}`;
}

/** How to cite a report: as text (also the line for a CV) and as a BibTeX technical report. */
export function citations(c: OpenBadgeCredential, slug: string, entry?: ReportEntry) {
  const r = recipientOf(c);
  const title = titleOf(c);
  const year = c.validFrom.slice(0, 4);
  const ref = entry ? reportReference(entry) : `${SITE.reportSeries} (${year})`;
  const text = `${r.name}, “${title},” ${ref}. ${urls.report(slug)}`;
  const bibtex = `@techreport{${entry ? citationKey(entry) : `physlib${year}-${slug}`},
  author      = {${r.name}},
  title       = {{${title}}},
  institution = {${SITE.title}},
  type        = {${SITE.reportSeries}},${entry ? `\n  number      = {${entry.number}},` : ''}
  year        = {${year}},
  note        = {${c.credentialSubject.achievement.name}},
  url         = {${urls.report(slug)}}
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
    certUrl: urls.report(slug),
    certId: c.id,
  });
  return `https://www.linkedin.com/profile/add?${params}`;
}

/** One plain sentence on what the report certifies, for readers outside the field. */
export function whatItMeans(c: OpenBadgeCredential) {
  const section = sectionById(sectionIdOf(c));
  if (section?.test) {
    return `This is a test report, made to try out how ${SITE.title} reports are submitted and signed. Test submissions need no maintainer approval; it is not a record of real work.`;
  }
  return `This report records that the maintainers of ${SITE.title} checked the evidence above and agreed that it meets the published criteria for ${
    section ? `the ${section.name} section` : 'this report'
  }. Physlib is an open-source library of physics formalised in the Lean 4 proof assistant.`;
}
