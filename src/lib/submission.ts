import { z } from 'zod';
import { EVIDENCE_KINDS, SECTION_IDS, sectionById } from './config';

/** Single-line text: no control characters (they could forge headings in Markdown previews). */
const line = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `Please enter ${label}` : `Please make ${label} at least ${min} characters long`)
    .max(max, `Please keep ${label} under ${max} characters`)
    .regex(/^[^\p{Cc}]*$/u, `Please write ${label} on a single line`);

const githubLogin = z
  .string()
  .trim()
  .min(1, 'Please enter a GitHub username')
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,
    'Enter just the GitHub username, e.g. octocat (letters, digits and hyphens; no @, spaces or link)',
  );

/**
 * The username in what people type into a GitHub username field: "@octocat",
 * "github.com/octocat" and "https://github.com/octocat/" all give "octocat".
 */
export function githubLoginFromInput(text: string): string {
  return text
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
}

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month');

/** ORCID iDs end in an ISO 7064 MOD 11-2 check digit. */
export function validOrcid(id: string): boolean {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id)) return false;
  const digits = id.replace(/-/g, '');
  let total = 0;
  for (const d of digits.slice(0, -1)) total = (total + Number(d)) * 2;
  const check = (12 - (total % 11)) % 11;
  return digits.at(-1) === (check === 10 ? 'X' : String(check));
}

const person = z.object({
  github: githubLogin,
  name: line('a name', 1, 120),
});

export const evidenceSchema = z.object({
  url: z.url({
    protocol: /^https$/,
    hostname: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i,
    error: 'Please enter a full https:// link',
  }).regex(/^[^\s<>"]+$/, 'Please enter a single link without spaces'),
  kind: z.enum(Object.keys(EVIDENCE_KINDS) as [keyof typeof EVIDENCE_KINDS, ...(keyof typeof EVIDENCE_KINDS)[]]),
  /** Optional: defaults to a name derived from the link, e.g. "Pull request #123". */
  title: line('a title', 1, 200).optional(),
  description: line('the note', 1, 1000).optional(),
});

/**
 * A submission is a JSON file under submissions/, sent by the contributor
 * whose work it describes (as an issue, or a pull request). When it is
 * accepted, the signing workflow signs it into an Open Badges 3.0 credential.
 */
export const submissionSchema = z
  .object({
    $schema: z.string().optional(),
    section: z.enum(SECTION_IDS, 'Choose a section'),
    title: line('the title', 5, 160),
    summary: z
      .string()
      .trim()
      .min(40, 'Please write at least a couple of sentences')
      .max(4000, 'Please keep the summary under 4000 characters'),
    recipient: person.extend({
      orcid: z
        .string()
        .trim()
        .refine(validOrcid, 'This is not a valid ORCID iD (it looks like 0000-0002-1825-0097)')
        .optional(),
    }),
    /** Others who did the work jointly. Each receives their own report, if they submit one. */
    collaborators: z.array(person).max(10).optional(),
    period: z
      .object({ from: month, to: month })
      .refine((p) => p.from <= p.to, { message: 'The work must end after it starts', path: ['to'] })
      .optional(),
    evidence: z.array(evidenceSchema).min(1, 'Please give at least one link').max(50),
    submittedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type Submission = z.infer<typeof submissionSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

/** Adds the https:// that people often leave off a pasted link. */
export function normaliseUrl(url: string): string {
  const u = url.trim();
  return u && !/^[a-z]+:/i.test(u) && /^[\w-]+(\.[\w-]+)+/.test(u) ? `https://${u}` : u;
}

/**
 * Pull request numbers from a pasted list, for importing evidence: numbers,
 * "#numbers" or links to pull requests of `repo`, separated by commas,
 * semicolons, spaces or new lines. Repeats are dropped; anything else is
 * returned as `invalid`.
 */
export function parsePullRequestList(text: string, repo: string): { numbers: number[]; invalid: string[] } {
  const numbers: number[] = [];
  const invalid: string[] = [];
  const link = new RegExp(`^(?:https?://)?(?:www\\.)?github\\.com/${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pull/(\\d+)(?:[/?#].*)?$`, 'i');
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const m = token.match(/^#?(\d+)$/) ?? token.match(link);
    const n = m ? Number(m[1]) : NaN;
    if (Number.isSafeInteger(n) && n > 0) {
      if (!numbers.includes(n)) numbers.push(n);
    } else invalid.push(token);
  }
  return { numbers, invalid };
}

/** The link to a pull request of `repo`. */
export const pullRequestUrl = (repo: string, n: number) => `https://github.com/${repo}/pull/${n}`;

/** The likely kind of an evidence link, from its URL; `fallback` for anything unrecognised. */
export function guessEvidenceKind(url: string, fallback: Evidence['kind']): Evidence['kind'] {
  if (/github\.com\/[^/]+\/[^/]+\/commit\//i.test(url)) return 'commit';
  if (/github\.com\/[^/]+\/[^/]+\/issues\//i.test(url)) return 'issue';
  if (/github\.com\/[^/]+\/[^/]+\/(tree|blob)\//i.test(url)) return 'module';
  if (/zulipchat\.com/i.test(url)) return 'zulip-thread';
  if (/github\.com\/[^/]+\/[^/]+\/pull\//i.test(url)) return fallback === 'pull-request-review' ? 'pull-request-review' : 'pull-request';
  return fallback;
}

/** The same link written differently (trailing slash, #anchor, ?query, case of the host) compares equal. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url;
  }
}

/** A readable default title for an evidence link. */
export function evidenceTitle(e: Pick<Evidence, 'url' | 'title' | 'kind'>): string {
  if (e.title) return e.title;
  const m = e.url.match(/github\.com\/[^/]+\/[^/]+\/(pull|issues|commit)\/([0-9a-f]+)/i);
  if (m) {
    const what = m[1] === 'pull' ? (e.kind === 'pull-request-review' ? 'Review of pull request' : 'Pull request') : m[1] === 'issues' ? 'Issue' : 'Commit';
    return `${what} ${m[1] === 'commit' ? m[2].slice(0, 7) : '#' + m[2]}`;
  }
  if (/zulipchat\.com/i.test(e.url)) return 'Zulip thread';
  const host = (() => {
    try {
      return new URL(e.url).host;
    } catch {
      return e.url;
    }
  })();
  return `${EVIDENCE_KINDS[e.kind]} (${host})`;
}

export function slugify(text: string, max = 48): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max + 1);
  // Cut at a word boundary when there is one.
  return cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : slug.slice(0, max);
}

/** File name (without extension) used for both the submission and the credential. */
export function submissionSlug(s: Pick<Submission, 'section' | 'recipient' | 'title' | 'submittedAt'>): string {
  const date = s.submittedAt.slice(0, 10);
  return [date, s.section, s.recipient.github.toLowerCase(), slugify(s.title, 40)].filter(Boolean).join('-');
}

/**
 * Whether a file name (without extension) fits a submission: its slug, or the
 * slug with a number added ("-2", "-3", …) when that name was already taken,
 * e.g. by an earlier submission with the same title on the same day.
 */
export function fitsSlug(name: string, slug: string): boolean {
  return name === slug || new RegExp(`^${slug}-[1-9][0-9]*$`).test(name);
}

/** Submission file names: lower-case letters, digits and hyphens only. */
export const SUBMISSION_FILE = /^submissions\/[a-z0-9-]+\.json$/;

/**
 * Readable, safe error lines. Field names come from the submitted file, so
 * unknown ones are reduced to plain identifiers before they are shown anywhere.
 */
export function formatIssues(error: z.ZodError): string[] {
  const safe = (k: PropertyKey) => (/^[\w$-]{1,40}$/.test(String(k)) ? String(k) : '(unusual name)');
  return error.issues.map((i) => {
    const where = i.path.map(safe).join('.') || '(top level)';
    return i.code === 'unrecognized_keys' ? `${where}: unknown field(s) ${i.keys.map(safe).join(', ')}` : `${where}: ${i.message}`;
  });
}

/** Escapes text for inclusion in GitHub Markdown. */
export function md(text: string): string {
  // "@" becomes an HTML entity so that names in submissions do not notify people.
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&').replace(/@/g, '&#64;');
}

/**
 * A readable account of a submission, used for the pull request description
 * and the reviewers' job summary.
 */
export function submissionMarkdown(s: Submission): string {
  const section = sectionById(s.section)!;
  const lines = [
    `**Section ${section.numeral}. ${md(section.name)}**: ${md(section.reportName)}`,
    `**Recipient:** ${md(s.recipient.name)} (@${s.recipient.github})`,
  ];
  if (s.collaborators?.length) {
    lines.push(`**Joint work with:** ${s.collaborators.map((c) => `${md(c.name)} (@${c.github})`).join(', ')}`);
  }
  if (s.period) lines.push(`**Period:** ${s.period.from} to ${s.period.to}`);
  lines.push(
    '',
    `### ${md(s.title)}`,
    '',
    ...s.summary.split('\n').map((l) => `> ${md(l)}`),
    '',
    '### Evidence',
    ...s.evidence.map(
      (e) => `- [${md(evidenceTitle(e))}](<${new URL(e.url).href}>) (${EVIDENCE_KINDS[e.kind]})${e.description ? `: ${md(e.description)}` : ''}`,
    ),
    '',
    '### Criteria',
    ...section.criteria.map((c) => `- [ ] ${md(c)}`),
  );
  return lines.join('\n');
}
