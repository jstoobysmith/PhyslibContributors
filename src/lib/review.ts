/**
 * Who may approve a report. Used by scripts/sign.ts before anything is signed.
 */
import { isTestSection, maintainerOf, SITE } from './config';
import { ACCEPT_COMMAND, isAcceptComment } from './issue-submission';
import type { Submission } from './submission';

export interface PullRequestReview {
  state: string; // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED
  user: { login: string; id?: number } | null;
  body?: string | null;
  /** The commit the review was made on. */
  commit_id?: string;
  submitted_at: string;
}

export interface PullRequestFacts {
  author: string;
  mergedBy?: string;
  /** The last commit of the pull request: approvals must be on it, so later pushes are not covered by earlier approvals. */
  headSha: string;
}

export type ApprovalDecision = { ok: true; approvers: string[] } | { ok: false; reason: string };

/** The phrase an approving maintainer includes in their review, e.g. "I have no conflict of interest". */
export const CONFLICT_DECLARATION = SITE.review.conflictDeclaration;

type Credited = Pick<Submission, 'recipient' | 'collaborators'>;

/** People who may not approve a submission: those it credits, and those who put it forward. */
export function conflictedLogins(pr: { author: string }, s: Credited): Set<string> {
  return new Set([s.recipient.github, pr.author, ...(s.collaborators ?? []).map((c) => c.github)].filter(Boolean).map((l) => l.toLowerCase()));
}

/**
 * Only each person's latest review counts, and only if it was made on the
 * commit that was merged. An approval counts only if it is from a listed
 * maintainer who is not credited by, and did not put forward, the submission,
 * and who declared no conflict of interest in the review. The pull request
 * must be opened by the contributor, and may not be merged by
 * anyone the report credits.
 *
 * Test submissions (the test section) are exempt, to make the process easy to
 * try: merging one is enough. Their reports say they are tests and are not
 * numbered or listed. Approvals that would count for a real report are still
 * recorded.
 */
export function approvalDecision(
  reviews: PullRequestReview[],
  pr: PullRequestFacts,
  submission: Credited & { section?: string },
  requiredApprovals = SITE.review.requiredApprovals,
): ApprovalDecision {
  const decision = strictDecision(reviews, pr, submission, requiredApprovals);
  if (submission.section && isTestSection(submission.section) && !decision.ok) return { ok: true, approvers: [] };
  return decision;
}

function strictDecision(reviews: PullRequestReview[], pr: PullRequestFacts, submission: Credited, requiredApprovals: number): ApprovalDecision {
  const author = pr.author.toLowerCase();
  if (author !== submission.recipient.github.toLowerCase()) {
    return { ok: false, reason: `it was opened by @${pr.author}, not by the contributor (@${submission.recipient.github})` };
  }

  const latest = new Map<string, PullRequestReview>();
  for (const r of [...reviews].filter((r) => r.user && r.state !== 'COMMENTED').sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))) {
    latest.set(r.user!.login.toLowerCase(), r);
  }
  const conflicted = conflictedLogins(pr, submission);
  const approvals = [...latest.values()].filter(
    (r) => r.state === 'APPROVED' && r.commit_id === pr.headSha && maintainerOf(r.user!) && !conflicted.has(r.user!.login.toLowerCase()),
  );
  const declared = approvals.filter((r) => (r.body ?? '').toLowerCase().includes(CONFLICT_DECLARATION.toLowerCase()));

  if (declared.length < requiredApprovals) {
    const undeclared = approvals.length - declared.length;
    return {
      ok: false,
      reason:
        `it needs ${requiredApprovals} approval(s), on its final version, from listed maintainers who are not involved in it and who wrote “${CONFLICT_DECLARATION}” in their approval; it has ${declared.length}` +
        (undeclared ? ` (${undeclared} approval(s) without the declaration)` : ''),
    };
  }
  if (pr.mergedBy && conflictedLogins({ author: '' }, submission).has(pr.mergedBy.toLowerCase())) {
    return { ok: false, reason: 'it was merged by someone it credits' };
  }
  return { ok: true, approvers: declared.map((r) => r.user!.login) };
}

// --- Submissions made as issues ----------------------------------------------------------

export interface IssueComment {
  user: { login: string; id?: number } | null;
  body?: string | null;
  created_at: string;
}

export interface IssueFacts {
  /** Who opened the issue. */
  author: string;
  /** When the issue's text was last edited, if ever. */
  lastEditedAt?: string | null;
}

/**
 * The same rules for a submission made as an issue. Each "/accept" comment is
 * an approval of the issue's text as it stood when the comment was made, so an
 * edit to the issue afterwards voids it (as a new commit voids a pull request
 * approval). The issue must be opened by the contributor.
 *
 * A test submission needs no approvals, but is accepted only when a listed
 * maintainer comments "/accept" (for a pull request, a maintainer's merge).
 */
export function issueApprovalDecision(
  comments: IssueComment[],
  issue: IssueFacts,
  submission: Credited & { section?: string },
  requiredApprovals = SITE.review.requiredApprovals,
): ApprovalDecision {
  const CURRENT = 'current';
  const accepts = comments.filter((c) => c.user && isAcceptComment(c.body));
  const reviews: PullRequestReview[] = accepts.map((c) => ({
    state: 'APPROVED',
    user: c.user,
    body: c.body,
    commit_id: !issue.lastEditedAt || c.created_at > issue.lastEditedAt ? CURRENT : 'earlier',
    submitted_at: c.created_at,
  }));
  if (submission.section && isTestSection(submission.section)) {
    const byMaintainer = reviews.some((r) => r.commit_id === CURRENT && maintainerOf(r.user!));
    if (!byMaintainer) return { ok: false, reason: 'a listed maintainer has not yet commented “/accept” on its current text' };
  }
  const decision = approvalDecision(reviews, { author: issue.author, headSha: CURRENT }, submission, requiredApprovals);
  const voided = reviews.filter((r) => r.commit_id !== CURRENT && maintainerOf(r.user!)).length;
  return decision.ok || !voided
    ? decision
    : { ok: false, reason: `${decision.reason} (${voided} earlier “${ACCEPT_COMMAND}” no longer count${voided === 1 ? 's' : ''}, because the submission was edited after it)` };
}
