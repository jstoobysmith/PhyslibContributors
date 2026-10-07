/**
 * The results of the setup check (scripts/setup-check/), as published on the
 * site's status page (public/data/status.json, written by the Setup check
 * workflow and added to the site when it is deployed).
 */

export type Outcome = 'pass' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
  /** "<part>.<n>", e.g. "3.2": check n of part 3, in scripts/setup-check/3-*.ts. */
  id: string;
  name: string;
  outcome: Outcome;
  /** What was found. */
  detail: string;
  /** For warnings and failures: what to do about it. */
  fix?: string;
}

export interface PartResult {
  number: number;
  title: string;
  /** What the part looks at. */
  covers: string;
  /** The part's file, relative to the repository root. */
  file: string;
  results: CheckResult[];
}

export interface SetupStatus {
  /** When the check ran (ISO 8601). */
  checkedAt: string;
  repository: string;
  siteUrl: string;
  /** The commit that was checked, and the workflow run, when run in GitHub Actions. */
  commit?: string;
  runUrl?: string;
  parts: PartResult[];
}

export const OUTCOMES: Outcome[] = ['pass', 'warn', 'fail', 'skip'];

export function countOutcomes(results: CheckResult[]): Record<Outcome, number> {
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const r of results) counts[r.outcome]++;
  return counts;
}
