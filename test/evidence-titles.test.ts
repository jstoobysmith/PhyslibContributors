import { describe, expect, it } from 'vitest';
import { buildCredential, type OpenBadgeCredential } from '../src/lib/credential';
import { githubEvidenceTitle, githubRef, retitledReport, untitledGitHubEvidence, untitledReportEvidence, withEvidenceTitles } from '../src/lib/evidence-titles';
import { exampleRecord, exampleSubmission } from './fixtures/example';

const PHYSLIB = 'https://github.com/leanprover-community/physlib';

describe('evidence titles from GitHub', () => {
  it('recognises pull requests, issues and commits in any repository', () => {
    expect(githubRef(`${PHYSLIB}/pull/412/files`)).toEqual({ owner: 'leanprover-community', repo: 'physlib', type: 'pull', id: '412' });
    expect(githubRef('https://github.com/Kernel-Science/physlib-website/issues/6')?.type).toBe('issues');
    expect(githubRef(`${PHYSLIB}/commit/abcdef1234`)?.id).toBe('abcdef1234');
    expect(githubRef(`${PHYSLIB}/pulls`)).toBeUndefined();
    expect(githubRef('https://leanprover.zulipchat.com/#narrow/x')).toBeUndefined();
  });

  it('writes titles as the report shows them', () => {
    expect(githubEvidenceTitle(githubRef(`${PHYSLIB}/pull/412`)!, 'pull-request-review', 'Add the Lorentz group')).toBe('Review of #412: Add the Lorentz group');
    expect(githubEvidenceTitle(githubRef(`${PHYSLIB}/pull/412`)!, 'pull-request', 'Add the Lorentz group')).toBe('#412: Add the Lorentz group');
    expect(githubEvidenceTitle(githubRef('https://github.com/Kernel-Science/physlib-website/pull/3')!, 'pull-request', 'Fix the menu')).toBe('Kernel-Science/physlib-website#3: Fix the menu');
    expect(githubEvidenceTitle(githubRef(`${PHYSLIB}/issues/9`)!, 'issue', 'Lorentz group missing')).toBe('Issue #9: Lorentz group missing');
    expect(githubEvidenceTitle(githubRef(`${PHYSLIB}/commit/abcdef1234`)!, 'commit', 'Bump Mathlib\n\nLonger text')).toBe('Commit abcdef1: Bump Mathlib');
    expect(githubEvidenceTitle(githubRef(`${PHYSLIB}/pull/1`)!, 'pull-request', 'x'.repeat(300)).length).toBe(200);
  });

  it('only gives titles to GitHub evidence that has none', () => {
    const s = {
      ...exampleSubmission,
      evidence: [
        { url: `${PHYSLIB}/pull/1`, kind: 'pull-request' as const, title: 'Given by hand' },
        { url: `${PHYSLIB}/pull/2`, kind: 'pull-request' as const },
        { url: 'https://leanprover.zulipchat.com/x', kind: 'zulip-thread' as const },
      ],
    };
    expect(untitledGitHubEvidence(s.evidence)).toEqual([{ url: `${PHYSLIB}/pull/2`, kind: 'pull-request' }]);
    const titles = new Map([
      [`${PHYSLIB}/pull/1`, '#1: Looked up'],
      [`${PHYSLIB}/pull/2`, '#2: Looked up'],
    ]);
    expect(withEvidenceTitles(s, titles).evidence.map((e) => e.title)).toEqual(['Given by hand', '#2: Looked up', undefined]);
  });

  it('adds titles to a signed report only where its evidence still has the automatic name', () => {
    const s = {
      ...exampleSubmission,
      evidence: [
        { url: `${PHYSLIB}/pull/1`, kind: 'pull-request-review' as const, title: 'Given by hand' },
        { url: `${PHYSLIB}/pull/2`, kind: 'pull-request-review' as const },
        { url: 'https://github.com/Kernel-Science/physlib-website/pull/3', kind: 'pull-request' as const },
      ],
    };
    const report = { ...buildCredential('x', s, exampleRecord), proof: { proofValue: 'z1' } } as unknown as OpenBadgeCredential;
    expect(untitledReportEvidence(report).map((e) => e.url)).toEqual([`${PHYSLIB}/pull/2`, 'https://github.com/Kernel-Science/physlib-website/pull/3']);

    const titles = new Map([
      [`${PHYSLIB}/pull/1`, 'Review of #1: Not used'],
      [`${PHYSLIB}/pull/2`, 'Review of #2: Looked up'],
    ]);
    const updated = retitledReport(report, titles) as unknown as OpenBadgeCredential;
    expect(updated.proof).toBeUndefined(); // to be signed again
    expect(updated.evidence!.map((e) => e.name)).toEqual([
      'Given by hand',
      'Review of #2: Looked up',
      'Pull request #3', // no title found: unchanged
      'Review of the submission: pull request #7',
    ]);
    // Everything else is exactly as signed.
    const { evidence: _a, proof: _b, ...rest } = report;
    const { evidence: _c, ...updatedRest } = updated;
    expect(updatedRest).toEqual(rest);
    expect(retitledReport(report, new Map())).toBeUndefined();
  });
});
