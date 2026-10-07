import { describe, expect, it } from 'vitest';
import { buildReportsIndex, nextReportNumber } from '../src/lib/reports';
import { buildCredential, type OpenBadgeCredential } from '../src/lib/credential';
import { exampleRecord, exampleSubmission } from './fixtures/example';

const cred = (slug: string, acceptedAt: string) =>
  buildCredential(slug, exampleSubmission, { ...exampleRecord, acceptedAt }) as unknown as OpenBadgeCredential;

describe('reports index', () => {
  it('numbers reports from the registry, not by date, and lists unsigned submissions as pending', () => {
    // b was accepted earlier but signed later: it keeps its later number.
    const credentials = [
      { slug: 'a', credential: cred('a', '2026-05-01T00:00:00Z') },
      { slug: 'b', credential: cred('b', '2026-04-01T00:00:00Z') },
    ];
    const submissions = new Map([
      ['a', exampleSubmission],
      ['b', exampleSubmission],
      ['c', exampleSubmission],
    ]);
    const index = buildReportsIndex(credentials, submissions, { a: 1, b: 2 }, [credentials[1].credential.id]);
    expect(index.published.map((e) => [e.slug, e.number, e.revoked])).toEqual([
      ['b', 2, true],
      ['a', 1, false],
    ]);
    expect(index.pending.map((p) => p.slug)).toEqual(['c']);
  });

  it('refuses to build an index with an unnumbered report', () => {
    expect(() => buildReportsIndex([{ slug: 'a', credential: cred('a', '2026-05-01T00:00:00Z') }], new Map(), {}, [])).toThrow();
  });

  it('never reuses numbers', () => {
    expect(nextReportNumber({})).toBe(1);
    expect(nextReportNumber({ a: 1, b: 5 })).toBe(6);
  });
});
