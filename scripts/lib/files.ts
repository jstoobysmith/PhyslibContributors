import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIssues, SUBMISSION_FILE, submissionSchema, submissionSlug, type Submission } from '../../src/lib/submission';
import type { OpenBadgeCredential } from '../../src/lib/credential';
import type { AwardNumbers } from '../../src/lib/awards';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const SUBMISSIONS_DIR = join(ROOT, 'submissions');
export const CREDENTIALS_DIR = join(ROOT, 'public', 'credentials');
/** Committed, append-only record of award numbers, written by scripts/sign.ts. */
export const AWARD_NUMBERS_FILE = join(ROOT, 'data', 'award-numbers.json');

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** Writes pretty JSON. Pass mode 0o600 for secrets. */
export function writeJson(path: string, data: unknown, mode?: number) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', mode === undefined ? undefined : { mode });
}

export const readAwardNumbers = () => (existsSync(AWARD_NUMBERS_FILE) ? readJson<AwardNumbers>(AWARD_NUMBERS_FILE) : {});

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
  const errors = expected === name ? [] : [`File must be named submissions/${expected}.json`];
  if (!SUBMISSION_FILE.test(file)) errors.push('Submission files must be directly in submissions/ and named with a-z, 0-9 and hyphens');
  return { file, slug: name, submission: parsed.data, errors };
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
