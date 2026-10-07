/**
 * Submissions made as GitHub issues, with the issue form in
 * .github/ISSUE_TEMPLATE/submission.yml: no fork or pull request is needed.
 * A listed maintainer accepts one by commenting "/accept" (see review.ts);
 * the Submission issue workflow then commits it, and it is signed like any other.
 */

/** The issue form, and the id of its field that holds the submission JSON (also its pre-fill parameter). */
export const ISSUE_FORM = 'submission.yml';
export const ISSUE_FIELD = 'submission';

/** The comment with which a maintainer accepts a submission. */
export const ACCEPT_COMMAND = '/accept';

export const isAcceptComment = (body?: string | null) => new RegExp(`^\\s*${ACCEPT_COMMAND}\\b`, 'i').test(body ?? '');

/**
 * The submission JSON in an issue's text. The issue form shows it as a ```json
 * block; a bare ``` block, or the whole text being JSON, are accepted too.
 */
export function submissionFromIssueBody(body: string | null | undefined): { data?: unknown; error?: string } {
  const text = (body ?? '').replace(/\r\n/g, '\n');
  const block = text.match(/```(?:json)?[ \t]*\n([\s\S]*?)\n```/);
  const json = block ? block[1] : text.trim().startsWith('{') ? text.trim() : undefined;
  if (!json) return { error: 'The issue does not contain a submission (a block of JSON, as written by the form on the site).' };
  try {
    return { data: JSON.parse(json) };
  } catch (e) {
    return { error: `The submission is not valid JSON (${(e as Error).message}).` };
  }
}

/** Compares two JSON values regardless of the order of object keys. */
export function sameJson(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canonical(x)]))
        : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
