/**
 * Submissions made as GitHub issues (see src/lib/issue-submission.ts), run by
 * the "Submission issue" workflow with the event in GITHUB_EVENT_PATH:
 *
 *   tsx scripts/issue-submission.ts summary   # issue opened or edited: post the summary for maintainers
 *   tsx scripts/issue-submission.ts accept    # "/accept" comment: if the rules are met, write the submission file
 *
 * The issue's text is untrusted: it is only ever parsed as JSON and validated,
 * and anything quoted from it is escaped. "accept" writes
 * submissions/<slug>.json and data/issue-submissions.json; the workflow
 * commits them, and the signing workflow re-checks the issue before signing.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, urls } from '../src/lib/config';
import { isAcceptComment, submissionFromIssueBody } from '../src/lib/issue-submission';
import { formatIssues, md, submissionSchema, submissionSlug, type Submission } from '../src/lib/submission';
import { ISSUE_SUBMISSIONS_FILE, readIssueSubmissions, ROOT, SUBMISSIONS_DIR, writeJson } from './lib/files';
import { fetchIssue, githubApi, issueReviewRecord } from './lib/review-record';
import { evidenceWarnings, maintainerNote, submissionSummary, summaryContext } from './lib/summary';

const command = process.argv[2];
const repo = process.env.GITHUB_REPOSITORY ?? `${SITE.repository.owner}/${SITE.repository.name}`;
const api = githubApi(repo, process.env.GITHUB_TOKEN);
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8')) as {
  issue: { number: number; user: { login: string }; body: string | null; state: string; pull_request?: unknown };
  comment?: { body: string | null; user: { login: string } };
};
const number = event.issue.number;

/** Marks the summary comment, so it is updated rather than posted again. */
const SUMMARY_MARK = '<!-- physlib-contributions: submission summary -->';

/** The submission in the issue, validated, with readable errors. */
function readSubmission(body: string | null): { submission?: Submission; errors: string[] } {
  const found = submissionFromIssueBody(body);
  if (found.error) return { errors: [found.error] };
  const parsed = submissionSchema.safeParse(found.data);
  return parsed.success ? { submission: parsed.data, errors: [] } : { errors: formatIssues(parsed.error) };
}

/** Whether the issue was opened by the person who may submit it: the recipient, or the nominator. */
function openedByWrongPerson(s: Submission, author: string): string | undefined {
  const allowed = [s.recipient.github, s.nominatedBy].filter(Boolean).map((l) => l!.toLowerCase());
  return allowed.includes(author.toLowerCase())
    ? undefined
    : `This issue was opened by @${author}, but a submission must be opened by the contributor (@${s.recipient.github})${
        s.nominatedBy ? ` or the nominator (@${s.nominatedBy})` : ''
      }. Please open it again from that account.`;
}

async function comment(body: string) {
  await api.send('POST', `/issues/${number}/comments`, { body });
}

async function summary() {
  const { submission, errors } = readSubmission(event.issue.body);
  if (submission) {
    const wrong = openedByWrongPerson(submission, event.issue.user.login);
    if (wrong) errors.push(wrong);
    if (existsSync(join(SUBMISSIONS_DIR, `${submissionSlug(submission)}.json`))) errors.push('A submission with this name has already been accepted.');
  }
  const ctx = summaryContext();
  const warnings = submission ? evidenceWarnings(ctx, submission) : [];
  const text = [
    SUMMARY_MARK,
    '## Submission summary',
    '',
    ...submissionSummary(ctx, { heading: submission ? md(submission.title) : 'Submission', submission, errors, warnings, venue: 'issue' }),
    '---',
    maintainerNote('issue'),
  ].join('\n');

  // Update the earlier summary if there is one.
  const comments = await api.all<{ id: number; body: string; user: { type: string } }>(`/issues/${number}/comments`);
  const earlier = comments.find((c) => c.user.type === 'Bot' && c.body.startsWith(SUMMARY_MARK));
  if (earlier) await api.send('PATCH', `/issues/comments/${earlier.id}`, { body: text });
  else await comment(text);
  console.log(errors.length ? `Summary posted, with ${errors.length} error(s).` : 'Summary posted.');
}

async function accept() {
  if (!isAcceptComment(event.comment?.body)) return console.log('Not an /accept comment.');
  if (event.issue.pull_request) return console.log('A pull request, not an issue.');
  const issue = await fetchIssue(api, repo, number);
  if (issue.state !== 'open') return comment('This submission is closed, so it cannot be accepted. Reopen it first.');

  const { submission, errors } = readSubmission(issue.body);
  if (!submission) return comment(`Not accepted: the submission is not valid.\n\n${errors.map((e) => `- ${md(e)}`).join('\n')}`);
  const slug = submissionSlug(submission);
  const file = join(SUBMISSIONS_DIR, `${slug}.json`);
  if (existsSync(file)) return comment(`This submission has already been accepted, as \`submissions/${slug}.json\`.`);

  // The same check the signing workflow makes before signing.
  const record = await issueReviewRecord(api, repo, number, submission);
  if ('refused' in record) {
    // Explained to maintainers; others' "/accept" comments are simply not counted.
    console.log(`Not accepted yet: ${record.refused}`);
    return comment(`Not accepted yet: ${md(record.refused.replace(/ \(issue #\d+\)$/, ''))}.`);
  }

  writeJson(file, { $schema: urls.submissionSchema(), ...submission });
  writeJson(ISSUE_SUBMISSIONS_FILE, { ...readIssueSubmissions(), [slug]: number });
  console.log(`Accepted ${slug}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\n`);
  // The workflow commits the files, then posts this and closes the issue.
  writeFileSync(
    join(process.env.RUNNER_TEMP ?? ROOT, 'accepted.md'),
    `Accepted, with thanks. The report will be signed and published within a few minutes at ${urls.report(slug)}`,
  );
}

if (command === 'summary') await summary();
else if (command === 'accept') await accept();
else throw new Error('usage: issue-submission.ts summary|accept');
