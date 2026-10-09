/**
 * Validates submission files and writes a summary for the maintainers who review them.
 *
 *   npm run validate                                    # every file in submissions/
 *   npm run validate -- --changed <files...>            # files changed by a pull request
 *   npm run validate -- --changed --markdown out.md <files...>
 *
 * With --changed, files must exist, and reports that have already been signed
 * may not be edited. The summary (also written to the GitHub job summary, and
 * posted on the pull request by submission-summary.yml) shows each submission,
 * the criteria, evidence already used in other reports, and the recipient's
 * previous reports.
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CREDENTIALS_DIR, listSubmissionFiles, loadSubmission } from './lib/files';
import { option, positional } from './lib/args';
import { evidenceDetails, evidenceWarnings, maintainerNote, submissionSummary, summaryContext } from './lib/summary';

const args = process.argv.slice(2);
const changed = args.includes('--changed');
const markdownOut = option(args, '--markdown');
const files = changed ? positional(args, ['--markdown']) : listSubmissionFiles();

const ctx = summaryContext();

let failed = false;
const summary: string[] = ['## Submission summary', ''];

for (const path of files) {
  if (!existsSync(path)) {
    failed = true;
    console.log(`✗ ${path}\n    error: file not found`);
    summary.push(`### ❌ ${path.replace(/[^\w./-]/g, '?')}`, '', '- **Error:** file not found', '');
    continue;
  }
  const { file, slug, submission, errors } = loadSubmission(path);
  if (changed && existsSync(join(CREDENTIALS_DIR, `${slug}.json`))) {
    errors.push('This report has already been signed; signed reports cannot be edited');
  }
  // Titles of GitHub evidence (as the report will show them), and who opened and reviewed each pull request (only with a token, as in the summary workflow).
  const looked = submission ? await evidenceDetails(submission) : undefined;
  const warnings = submission ? [...evidenceWarnings(ctx, submission, slug), ...(looked?.warnings ?? [])] : [];

  failed ||= errors.length > 0;
  console.log(`${errors.length ? '✗' : '✓'} ${file}`);
  errors.forEach((e) => console.log(`    error: ${e}`));
  warnings.forEach((w) => console.log(`    warning: ${w}`));
  summary.push(...submissionSummary(ctx, { heading: `\`${file}\``, submission, errors, warnings, venue: 'pull request', titles: looked?.titles, people: looked?.people }));
}

summary.push('---', maintainerNote('pull request'));

const text = summary.join('\n') + '\n';
if (markdownOut) writeFileSync(markdownOut, text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
if (files.length === 0) console.log('No submissions to check.');
process.exit(failed ? 1 : 0);
