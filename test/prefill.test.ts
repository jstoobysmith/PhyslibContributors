import { describe, expect, it } from 'vitest';
import { prefillParams, readPrefill, splitEvidenceLinks } from '../src/lib/prefill';

describe('links that fill in the form', () => {
  it('reads the fields from a link', () => {
    const p = readPrefill(
      new URLSearchParams('section=review&name=Ada%20Example&github=@ada&title=Reviewed%2010%20pull%20requests&prs=412,%23418&from=2026-01&to=2026-13&link=https://example.org/x&link=javascript:alert(1)'),
    );
    expect(p).toEqual({
      section: 'review',
      name: 'Ada Example',
      github: 'ada',
      orcid: undefined,
      nominator: undefined,
      title: 'Reviewed 10 pull requests',
      summary: undefined,
      from: '2026-01',
      to: undefined, // not a month
      prs: [412, 418],
      links: ['https://example.org/x'], // only https links
    });
  });

  it('ignores links that only choose a section, and unknown sections', () => {
    expect(readPrefill(new URLSearchParams('section=review'))).toBeUndefined();
    expect(readPrefill(new URLSearchParams('section=nonsense&name=A'))?.section).toBeUndefined();
  });

  it('round-trips', () => {
    const p = { section: 'maintenance' as const, name: 'B', github: 'b', summary: 'Line one.\n\nLine two.', prs: [1, 2], links: ['https://x.org/a', 'https://x.org/b'] };
    expect(readPrefill(prefillParams(p))).toMatchObject(p);
  });

  it('writes Physlib pull requests compactly', () => {
    expect(splitEvidenceLinks(['https://github.com/leanprover-community/physlib/pull/7', 'https://github.com/leanprover-community/physlib/pull/7/files', 'https://zulip.example/x', ''])).toEqual({
      prs: [7],
      links: ['https://github.com/leanprover-community/physlib/pull/7/files', 'https://zulip.example/x'],
    });
  });
});
