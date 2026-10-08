import { describe, expect, it } from 'vitest';
import { MAINTAINERS } from '../src/lib/config';
import { approvalDecision, type PullRequestReview } from '../src/lib/review';

const m = MAINTAINERS[0];
const maintainer = m.github;
const HEAD = 'head-sha';
const review = (login: string, state: string, at: string, body = 'Looks good. I have no conflict of interest.', commit_id = HEAD, id = m.id): PullRequestReview => ({
  user: { login, id },
  state,
  body,
  commit_id,
  submitted_at: at,
});
const submission = { recipient: { github: 'alice', name: 'Alice' } };
const pr = (extra: Partial<{ author: string; mergedBy: string }> = {}) => ({ author: 'alice', headSha: HEAD, ...extra });

describe('approval rules', () => {
  it('accepts an approval from a maintainer who is not involved', () => {
    expect(approvalDecision([review(maintainer, 'APPROVED', '1')], pr({ mergedBy: maintainer }), submission, 1)).toEqual({ ok: true, approvers: [maintainer] });
  });

  it('ignores approvals from non-maintainers, and from a maintainer login now used by another account', () => {
    expect(approvalDecision([review('sock-puppet', 'APPROVED', '1')], pr(), submission, 1).ok).toBe(false);
    if (m.id !== undefined) {
      expect(approvalDecision([review(maintainer, 'APPROVED', '1', undefined, HEAD, m.id + 1)], pr(), submission, 1).ok).toBe(false);
    }
  });

  it('ignores approvals given on an earlier commit', () => {
    expect(approvalDecision([review(maintainer, 'APPROVED', '1', undefined, 'older-sha')], pr(), submission, 1).ok).toBe(false);
  });

  it('requires the pull request to be opened by the contributor', () => {
    const d = approvalDecision([review(maintainer, 'APPROVED', '1')], pr({ author: 'mallory' }), submission, 1);
    expect(d.ok).toBe(false);
    expect(approvalDecision([review(maintainer, 'APPROVED', '1')], pr({ author: 'alice' }), submission, 1).ok).toBe(true);
  });

  it('ignores approvals from the recipient or people named as joint work', () => {
    const self = { recipient: { github: maintainer, name: 'M' } };
    expect(approvalDecision([review(maintainer, 'APPROVED', '1')], pr({ author: maintainer }), self, 1).ok).toBe(false);
    const joint = { ...submission, collaborators: [{ github: maintainer, name: 'M' }] };
    expect(approvalDecision([review(maintainer, 'APPROVED', '1')], pr(), joint, 1).ok).toBe(false);
  });

  it('requires approvers to declare no conflict of interest', () => {
    const d = approvalDecision([review(maintainer, 'APPROVED', '1', 'LGTM')], pr(), submission, 1);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toContain('without the declaration');
  });

  it('uses only the latest review of each person', () => {
    const withdrawn = [review(maintainer, 'APPROVED', '2026-01-01'), review(maintainer, 'CHANGES_REQUESTED', '2026-01-02')];
    expect(approvalDecision(withdrawn, pr(), submission, 1).ok).toBe(false);
    const comment = [review(maintainer, 'APPROVED', '2026-01-01'), review(maintainer, 'COMMENTED', '2026-01-02')];
    expect(approvalDecision(comment, pr(), submission, 1).ok).toBe(true);
  });

  it('does not let anyone the report credits merge it', () => {
    expect(approvalDecision([review(maintainer, 'APPROVED', '1')], pr({ mergedBy: 'alice' }), submission, 1).ok).toBe(false);
  });

  it('signs test submissions without approvals, whoever opened or merged them', () => {
    const test = { ...submission, section: 'test' };
    expect(approvalDecision([], pr({ author: 'someone-else', mergedBy: 'alice' }), test, 1)).toEqual({ ok: true, approvers: [] });
    // Approvals that would count for a real report are still recorded.
    expect(approvalDecision([review(maintainer, 'APPROVED', '1')], pr(), test, 1)).toEqual({ ok: true, approvers: [maintainer] });
    // Real sections keep every rule.
    expect(approvalDecision([], pr(), { ...submission, section: 'review' }, 1).ok).toBe(false);
  });
});
