/**
 * Who may approve an award. Used by scripts/sign.ts before anything is signed.
 */
import { maintainerOf, SITE } from './config';
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

type Credited = Pick<Submission, 'recipient' | 'nominatedBy' | 'collaborators'>;

/** People who may not approve a submission: those it credits, and those who put it forward. */
export function conflictedLogins(pr: { author: string }, s: Credited): Set<string> {
  return new Set([s.recipient.github, pr.author, s.nominatedBy ?? '', ...(s.collaborators ?? []).map((c) => c.github)].filter(Boolean).map((l) => l.toLowerCase()));
}

/**
 * Only each person's latest review counts, and only if it was made on the
 * commit that was merged. An approval counts only if it is from a listed
 * maintainer who is not credited by, and did not put forward, the submission,
 * and who declared no conflict of interest in the review. The pull request
 * must be opened by the recipient or the nominator, and may not be merged by
 * anyone the award credits.
 */
export function approvalDecision(
  reviews: PullRequestReview[],
  pr: PullRequestFacts,
  submission: Credited,
  requiredApprovals = SITE.review.requiredApprovals,
): ApprovalDecision {
  const author = pr.author.toLowerCase();
  if (author !== submission.recipient.github.toLowerCase() && author !== submission.nominatedBy?.toLowerCase()) {
    return { ok: false, reason: `the pull request was opened by @${pr.author}, who is neither the recipient nor the nominator` };
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
        `it needs ${requiredApprovals} approval(s), on the final version of the pull request, from listed maintainers who are not involved in it and who wrote “${CONFLICT_DECLARATION}” in their review; it has ${declared.length}` +
        (undeclared ? ` (${undeclared} approval(s) without the declaration)` : ''),
    };
  }
  if (pr.mergedBy && conflictedLogins({ author: '' }, submission).has(pr.mergedBy.toLowerCase())) {
    return { ok: false, reason: 'it was merged by someone it credits' };
  }
  return { ok: true, approvers: declared.map((r) => r.user!.login) };
}
