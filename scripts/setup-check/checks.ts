/**
 * Building blocks of the setup check. The check is split into numbered parts,
 * one file per part (2-configuration.ts is part 2, and so on). Each part runs
 * checks numbered <part>.<n>, and each check returns a verdict:
 *
 *   pass  the thing works
 *   warn  it works, but needs attention (usually before launch)
 *   fail  it is broken: something will not work until it is fixed
 *   skip  it cannot be checked here (for example, secrets outside GitHub Actions)
 */
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../lib/files';
import type { CheckResult, Outcome } from '../../src/lib/setup-status';

export type { CheckResult, Outcome };

export interface Verdict {
  outcome: Outcome;
  /** What was found, in a sentence or two. */
  detail: string;
  /** For warnings and failures: what to do about it. */
  fix?: string;
}

export const pass = (detail: string): Verdict => ({ outcome: 'pass', detail });
export const warn = (detail: string, fix?: string): Verdict => ({ outcome: 'warn', detail, fix });
export const fail = (detail: string, fix?: string): Verdict => ({ outcome: 'fail', detail, fix });
export const skip = (detail: string): Verdict => ({ outcome: 'skip', detail });

/** Runs one check. Exceptions become failures, so one broken check does not stop the others. */
export type Check = (id: string, name: string, test: () => Verdict | Promise<Verdict>) => Promise<Verdict>;

export interface Part {
  number: number;
  title: string;
  /** What the part looks at, in a sentence. */
  covers: string;
  /** The part's file, relative to the repository root. */
  file: string;
  run(check: Check): Promise<void>;
}

/** Declares a part; pass `import.meta.url` as `file`. */
export function definePart(part: Omit<Part, 'file'> & { file: string }): Part {
  return { ...part, file: relative(ROOT, fileURLToPath(part.file)) };
}

/** "a, b and c" */
export function listing(items: string[], max = 5): string {
  const shown = items.slice(0, max);
  const more = items.length - shown.length;
  const all = more > 0 ? [...shown, `${more} more`] : shown;
  return all.length <= 1 ? (all[0] ?? '') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
