import { describe, expect, it } from 'vitest';
import { MAINTAINERS } from '../src/lib/config';
import { isAcceptComment, sameJson, submissionFromIssueBody } from '../src/lib/issue-submission';
import { issueApprovalDecision, type IssueComment } from '../src/lib/review';
import { exampleSubmission } from './fixtures/example';

const m = MAINTAINERS[0];
const at = (minute: number) => `2026-01-01T00:${String(minute).padStart(2, '0')}:00Z`;
const accept = (minute: number, body = '/accept I have no conflict of interest.', user = { login: m.github, id: m.id }): IssueComment => ({
  user,
  body,
  created_at: at(minute),
});
const submission = { ...exampleSubmission, recipient: { github: 'alice', name: 'Alice' } };
const issue = { author: 'alice', lastEditedAt: null };

describe('submissions made as issues', () => {
  it('reads the submission from the text the issue form writes', () => {
    const body = `### Submission\n\n\`\`\`json\n${JSON.stringify(submission, null, 2)}\n\`\`\`\n`;
    expect(sameJson(submissionFromIssueBody(body).data, submission)).toBe(true);
    expect(sameJson(submissionFromIssueBody(body.replace(/\n/g, '\r\n')).data, submission)).toBe(true);
    expect(submissionFromIssueBody('### Submission\n\n_No response_').error).toMatch(/does not contain/);
    expect(submissionFromIssueBody('```json\n{ not json }\n```').error).toMatch(/not valid JSON/);
  });

  it('compares submissions regardless of key order', () => {
    expect(sameJson({ a: 1, b: [{ c: 2, d: 3 }] }, { b: [{ d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('recognises "/accept" comments', () => {
    expect(isAcceptComment('/accept I have no conflict of interest')).toBe(true);
    expect(isAcceptComment('  /Accept')).toBe(true);
    expect(isAcceptComment('I would /accept this')).toBe(false);
    expect(isAcceptComment('/acceptable')).toBe(false);
  });

  it('accepts an "/accept" from an uninvolved maintainer with the declaration', () => {
    expect(issueApprovalDecision([accept(1)], issue, submission, 1)).toEqual({ ok: true, approvers: [m.github] });
  });

  it('needs the declaration, and ignores other people and other comments', () => {
    expect(issueApprovalDecision([accept(1, '/accept')], issue, submission, 1).ok).toBe(false);
    expect(issueApprovalDecision([accept(1, 'Looks good, no conflict of interest')], issue, submission, 1).ok).toBe(false);
    expect(issueApprovalDecision([accept(1, undefined, { login: 'not-a-maintainer', id: 1 })], issue, submission, 1).ok).toBe(false);
  });

  it('voids acceptances made before the issue was last edited', () => {
    expect(issueApprovalDecision([accept(1)], { ...issue, lastEditedAt: at(2) }, submission, 1).ok).toBe(false);
    expect(issueApprovalDecision([accept(3)], { ...issue, lastEditedAt: at(2) }, submission, 1).ok).toBe(true);
  });

  it('must be opened by the recipient or nominator, and not accepted by anyone involved', () => {
    expect(issueApprovalDecision([accept(1)], { ...issue, author: 'mallory' }, submission, 1).ok).toBe(false);
    const own = { ...submission, recipient: { github: m.github, name: m.name } };
    expect(issueApprovalDecision([accept(1)], { ...issue, author: m.github }, own, 1).ok).toBe(false);
  });

  it('accepts a test submission when any listed maintainer comments "/accept"', () => {
    const test = { ...submission, section: 'test' as const };
    expect(issueApprovalDecision([], issue, test, 1).ok).toBe(false);
    expect(issueApprovalDecision([accept(1, undefined, { login: 'not-a-maintainer', id: 1 })], issue, test, 1).ok).toBe(false);
    expect(issueApprovalDecision([accept(1, '/accept')], { ...issue, author: 'someone' }, test, 1).ok).toBe(true);
  });
});
