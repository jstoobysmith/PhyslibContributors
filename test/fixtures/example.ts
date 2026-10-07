import type { Submission } from '../../src/lib/submission';
import type { ReviewRecord } from '../../src/lib/credential';

export const exampleSubmission: Submission = {
  section: 'review',
  title: 'Reviewing the Lorentz group API',
  summary: 'Careful review of a long series of pull requests introducing the Lorentz group, catching sign conventions and suggesting a cleaner API.',
  recipient: { github: 'example-reviewer', name: 'Ada Example', orcid: '0000-0002-1825-0097' },
  period: { from: '2026-01', to: '2026-06' },
  evidence: [
    { url: 'https://github.com/leanprover-community/physlib/pull/1', kind: 'pull-request-review', title: 'Review of #1' },
    { url: 'https://github.com/leanprover-community/physlib/pull/2', kind: 'pull-request-review', description: 'Found a sign error.' },
  ],
  submittedAt: '2026-07-01T12:00:00Z',
};

export const exampleRecord: ReviewRecord = {
  acceptedAt: '2026-07-03T09:00:00Z',
  pullRequest: { number: 7, url: 'https://github.com/example/repo/pull/7', author: 'example-reviewer' },
  reviewers: ['maintainer-a', 'maintainer-b'],
  mergedBy: 'maintainer-a',
};
