import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitsSlug, formatIssues, SUBMISSION_FILE, submissionSchema, submissionSlug, type Submission } from '../../src/lib/submission';
import type { OpenBadgeCredential } from '../../src/lib/credential';
import type { ReportNumbers } from '../../src/lib/reports';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SUBMISSIONS_DIR = join(ROOT, 'submissions');
export const CREDENTIALS_DIR = join(ROOT, 'public', 'credentials');
/** Committed, append-only record of report numbers, written by scripts/sign.ts. */
export const REPORT_NUMBERS_FILE = join(ROOT, 'data', 'report-numbers.json');
/** Submissions accepted on an issue: slug -> issue number. Written by scripts/issue-submission.ts. */
export const ISSUE_SUBMISSIONS_FILE = join(ROOT, 'data', 'issue-submissions.json');

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Writes pretty JSON. Pass mode 0o600 for secrets. */
export function writeJson(path: string, data: unknown, mode?: number) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', mode === undefined ? undefined : { mode });
}

export const readIssueSubmissions = (): Record<string, number> => (existsSync(ISSUE_SUBMISSIONS_FILE) ? readJson(ISSUE_SUBMISSIONS_FILE) : {});

export const readReportNumbers = () => (existsSync(REPORT_NUMBERS_FILE) ? readJson<ReportNumbers>(REPORT_NUMBERS_FILE) : {});

export interface LoadedSubmission {
  file: string; // repo-relative path
  slug: string;
  submission?: Submission;
  errors: string[];
}

export function loadSubmission(path: string): LoadedSubmission {
  const abs = resolve(ROOT, path);
  const file = abs.slice(ROOT.length + 1);
  const name = abs.split('/').pop()!.replace(/\.json$/, '');
  let raw: unknown;
  try {
    raw = readJson(abs);
  } catch (e) {
    return { file, slug: name, errors: ['Not valid JSON'] };
  }
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) return { file, slug: name, errors: formatIssues(parsed.error) };
  const expected = submissionSlug(parsed.data);
  const errors = fitsSlug(name, expected) ? [] : [`File must be named submissions/${expected}.json`];
  if (!SUBMISSION_FILE.test(file)) errors.push('Submission files must be directly in submissions/ and named with a-z, 0-9 and hyphens');
  return { file, slug: name, submission: parsed.data, errors };
}

/** The submission's slug, or, if a file already has that name, the slug with the next free number ("-2", "-3", …). */
export function freeSlug(slug: string): string {
  if (!existsSync(join(SUBMISSIONS_DIR, `${slug}.json`))) return slug;
  let n = 2;
  while (existsSync(join(SUBMISSIONS_DIR, `${slug}-${n}.json`))) n++;
  return `${slug}-${n}`;
}

export function listSubmissionFiles(): string[] {
  if (!existsSync(SUBMISSIONS_DIR)) return [];
  return readdirSync(SUBMISSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join('submissions', f));
}

export function listCredentials(): { slug: string; credential: OpenBadgeCredential }[] {
  if (!existsSync(CREDENTIALS_DIR)) return [];
  return readdirSync(CREDENTIALS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ slug: f.replace(/\.json$/, ''), credential: readJson<OpenBadgeCredential>(join(CREDENTIALS_DIR, f)) }));
}
