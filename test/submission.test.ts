import { describe, expect, it } from 'vitest';
import { canonicalUrl, evidenceTitle, formatIssues, githubLoginFromInput, guessEvidenceKind, md, normaliseUrl, submissionMarkdown, submissionSchema, submissionSlug, validOrcid } from '../src/lib/submission';
import { loadSubmission } from '../scripts/lib/files';
import { exampleSubmission } from './fixtures/example';

const errorsFor = (s: unknown) => {
  const r = submissionSchema.safeParse(s);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('submission schema', () => {
  it('accepts the example', () => {
    expect(errorsFor(exampleSubmission)).toEqual({});
  });

  it('gives readable messages', () => {
    const e = errorsFor({ ...exampleSubmission, title: 'x', recipient: { github: 'a', name: '' } });
    expect(e.title).toMatch(/^Please make the title at least 5 characters long$/);
    expect(e['recipient.name']).toBe('Please enter a name');
  });

  it('checks ORCID checksums', () => {
    expect(validOrcid('0000-0002-1825-0097')).toBe(true);
    expect(validOrcid('0000-0002-1825-009X')).toBe(false);
    expect(errorsFor({ ...exampleSubmission, recipient: { ...exampleSubmission.recipient, orcid: '0000-0002-1825-009X' } })['recipient.orcid']).toBeDefined();
  });

  it('rejects multi-line titles and links without a host', () => {
    expect(errorsFor({ ...exampleSubmission, title: 'Fine title\n## ✅ Approved' }).title).toBeDefined();
    const bad = (url: string) => errorsFor({ ...exampleSubmission, evidence: [{ url, kind: 'other' }] })['evidence.0.url'];
    expect(bad('https:alert')).toBeDefined();
    expect(bad('javascript:alert(1)')).toBeDefined();
    expect(bad('https://github.com/x')).toBeUndefined();
  });

  it('requires consent for nominations, and no self-nomination', () => {
    expect(errorsFor({ ...exampleSubmission, nominatedBy: 'someone-else' }).recipientConsent).toBeDefined();
    expect(errorsFor({ ...exampleSubmission, nominatedBy: 'someone-else', recipientConsent: true })).toEqual({});
    expect(errorsFor({ ...exampleSubmission, nominatedBy: 'Example-Reviewer', recipientConsent: true }).nominatedBy).toBeDefined();
  });

  it('requires the period to end after it starts', () => {
    expect(errorsFor({ ...exampleSubmission, period: { from: '2026-05', to: '2026-01' } })['period.to']).toBeDefined();
  });
});

describe('submission helpers', () => {
  it('reads a GitHub username however it is typed', () => {
    for (const typed of ['octocat', ' @octocat ', 'github.com/octocat', 'https://github.com/octocat/', 'https://www.github.com/octocat']) {
      expect(githubLoginFromInput(typed)).toBe('octocat');
    }
    expect(errorsFor({ ...exampleSubmission, recipient: { ...exampleSubmission.recipient, github: '@octocat' } })['recipient.github']).toMatch(/e\.g\. octocat/);
  });

  it('derives evidence titles from links', () => {
    expect(evidenceTitle({ url: 'https://github.com/o/r/pull/12', kind: 'pull-request' })).toBe('Pull request #12');
    expect(evidenceTitle({ url: 'https://github.com/o/r/pull/12', kind: 'pull-request-review' })).toBe('Review of pull request #12');
    expect(evidenceTitle({ url: 'https://github.com/o/r/commit/abcdef1234', kind: 'commit' })).toBe('Commit abcdef1');
    expect(evidenceTitle({ url: 'https://github.com/o/r/pull/12', kind: 'pull-request', title: 'Mine' })).toBe('Mine');
  });

  it('adds https:// and guesses the kind of a link', () => {
    expect(normaliseUrl('github.com/o/r/pull/1')).toBe('https://github.com/o/r/pull/1');
    expect(normaliseUrl('https://x.org')).toBe('https://x.org');
    expect(normaliseUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(guessEvidenceKind('https://github.com/o/r/commit/abc', 'pull-request')).toBe('commit');
    expect(guessEvidenceKind('https://github.com/o/r/pull/3', 'pull-request-review')).toBe('pull-request-review');
    expect(guessEvidenceKind('https://leanprover.zulipchat.com/#narrow/x', 'pull-request')).toBe('zulip-thread');
    expect(guessEvidenceKind('https://example.com/blog', 'other')).toBe('other');
  });

  it('makes stable, URL-safe slugs cut at word boundaries', () => {
    expect(submissionSlug(exampleSubmission)).toBe('2026-07-01-review-example-reviewer-reviewing-the-lorentz-group-api');
    expect(submissionSlug({ ...exampleSubmission, title: 'Keeping Physlib on Mathlib master through 2026' })).toBe(
      '2026-07-01-review-example-reviewer-keeping-physlib-on-mathlib-master',
    );
  });

  it('compares links written differently as the same', () => {
    expect(canonicalUrl('https://GitHub.com/o/r/pull/240/')).toBe(canonicalUrl('https://github.com/o/r/pull/240#discussion'));
    expect(canonicalUrl('https://github.com/o/r/pull/240?x=1')).toBe('https://github.com/o/r/pull/240');
  });

  it('rejects links that could break out of Markdown', () => {
    const r = submissionSchema.safeParse({ ...exampleSubmission, evidence: [{ url: 'https://github.com/o/r/pull/1>)[click](https://evil.example)<x', kind: 'other' }] });
    expect(r.success).toBe(false);
  });

  it('escapes Markdown and mentions in previews', () => {
    expect(md('**bold** [x](y)')).toBe('\\*\\*bold\\*\\* \\[x\\]\\(y\\)');
    expect(md('thanks @someone')).toBe('thanks &#64;someone');
    const preview = submissionMarkdown({ ...exampleSubmission, title: '# Approved' });
    expect(preview).toContain('### \\# Approved');
  });

  it('never echoes unusual field names into error messages', () => {
    const r = submissionSchema.safeParse({ ...exampleSubmission, 'x\n\n## ✅ Approved by @someone': 1, extra_field: 2 });
    expect(r.success).toBe(false);
    const lines = formatIssues(r.error!);
    expect(lines.join('\n')).not.toMatch(/Approved|@|\n#/);
    expect(lines.join(' ')).toContain('extra_field');
  });

  it('requires the file name to match the content', () => {
    const r = loadSubmission('examples/specimen.submission.json');
    expect(r.errors.some((e) => e.startsWith('File must be named submissions/'))).toBe(true);
  });
});
