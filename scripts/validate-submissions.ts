/**
 * Validates submission files and writes a summary for the maintainers who review them.
 *
 *   npm run validate                                    # every file in submissions/
 *   npm run validate -- --changed <files...>            # files changed by a pull request
 *   npm run validate -- --changed --markdown out.md <files...>
 *
 * With --changed, files must exist, and awards that have already been signed
 * may not be edited. The summary (also written to the GitHub job summary, and
 * posted on the pull request by submission-summary.yml) shows each submission,
 * the criteria, evidence already used in other awards, and the recipient's
 * previous awards.
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE } from '../src/lib/config';
import { evidenceOf, recipientOf, titleOf } from '../src/lib/credential';
import { CONFLICT_DECLARATION } from '../src/lib/review';
import { canonicalUrl, md, submissionMarkdown } from '../src/lib/submission';
import { CREDENTIALS_DIR, listCredentials, listSubmissionFiles, loadSubmission, readAwardNumbers } from './lib/files';
import { option, positional } from './lib/args';

const args = process.argv.slice(2);
const changed = args.includes('--changed');
const markdownOut = option(args, '--markdown');
const files = changed ? positional(args, ['--markdown']) : listSubmissionFiles();

const trusted = [`https://github.com/${SITE.physlib.repository}/`, new URL(SITE.physlib.zulip).origin + '/'];

// What has already been awarded, to spot evidence claimed twice.
const numbers = readAwardNumbers();
const signed = listCredentials();
const usedIn = new Map<string, string[]>();
const note = (url: string, where: string) => usedIn.set(canonicalUrl(url), [...(usedIn.get(canonicalUrl(url)) ?? []), where]);
for (const { slug, credential } of signed) {
  for (const e of evidenceOf(credential).work) if (e.id) note(e.id, `award no. ${numbers[slug] ?? '?'} (${titleOf(credential)})`);
}
for (const f of listSubmissionFiles()) {
  const s = loadSubmission(f);
  if (s.submission && !signed.some((c) => c.slug === s.slug)) for (const e of s.submission.evidence) note(e.url, `the accepted submission ${s.file}`);
}

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
    errors.push('This award has already been signed; signed awards cannot be edited');
  }
  const warnings: string[] = [];
  for (const e of submission?.evidence ?? []) {
    if (!trusted.some((t) => e.url.startsWith(t))) warnings.push(`Evidence outside Physlib's GitHub and Zulip; check it by hand: <${e.url}>`);
    const elsewhere = (usedIn.get(canonicalUrl(e.url)) ?? []).filter((w) => !w.endsWith(file));
    if (elsewhere.length) warnings.push(`<${e.url}> is already evidence for ${elsewhere.map(md).join('; ')}`);
  }
  const previous = submission
    ? signed.filter(({ credential }) => recipientOf(credential).github?.toLowerCase() === submission.recipient.github.toLowerCase())
    : [];

  failed ||= errors.length > 0;
  console.log(`${errors.length ? '✗' : '✓'} ${file}`);
  errors.forEach((e) => console.log(`    error: ${e}`));
  warnings.forEach((w) => console.log(`    warning: ${w}`));

  summary.push(`### ${errors.length ? '❌' : '✅'} \`${file}\``, '');
  // Errors can echo text from the submitted file, so they are escaped like everything else.
  const line = (t: string) => md(t.replace(/\s+/g, ' '));
  errors.forEach((e) => summary.push(`- **Error:** ${line(e)}`));
  warnings.forEach((w) => summary.push(`- **Check:** ${w}`));
  if (submission) {
    summary.push('', submissionMarkdown(submission), '');
    summary.push(
      previous.length
        ? `**Previous awards to @${submission.recipient.github}:** ${previous.map(({ slug: s, credential }) => `no. ${numbers[s] ?? '?'} ${md(titleOf(credential))}`).join('; ')}`
        : `**Previous awards to @${submission.recipient.github}:** none`,
      '',
    );
  }
}

summary.push(
  '---',
  `**For maintainers.** Check each criterion against the evidence. To approve, submit an *Approve* review whose text includes “${CONFLICT_DECLARATION}”; ` +
    'approvals from anyone credited by the submission, the nominator or the author of this pull request do not count. ' +
    'You may ask for changes, or close a submission that does not clearly meet the criteria.',
);

const text = summary.join('\n') + '\n';
if (markdownOut) writeFileSync(markdownOut, text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
if (files.length === 0) console.log('No submissions to check.');
process.exit(failed ? 1 : 0);
