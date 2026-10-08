/**
 * The summary of a submission that maintainers review: shown on its pull
 * request (scripts/validate-submissions.ts) or its issue
 * (scripts/issue-submission.ts). It lists the submission, warnings about its
 * evidence, and the contributor's previous reports. Text from the submission
 * is escaped, as it comes from whoever submitted it.
 */
import { isTestSection, SITE } from '../../src/lib/config';
import { evidenceOf, recipientOf, sectionIdOf, titleOf } from '../../src/lib/credential';
import { ACCEPT_COMMAND } from '../../src/lib/issue-submission';
import { CONFLICT_DECLARATION } from '../../src/lib/review';
import { canonicalUrl, md, submissionMarkdown, type Submission } from '../../src/lib/submission';
import { listCredentials, listSubmissionFiles, loadSubmission, readReportNumbers } from './files';

const TRUSTED = [`https://github.com/${SITE.physlib.repository}/`, new URL(SITE.physlib.zulip).origin + '/'];

export type Venue = 'pull request' | 'issue';

/** What is already published or accepted, to spot evidence claimed twice and list previous reports. */
export function summaryContext() {
  const numbers = readReportNumbers();
  const signed = listCredentials();
  // Evidence link -> where it is already used. Test reports use placeholder evidence, so they are left out.
  const usedIn = new Map<string, { slug: string; label: string }[]>();
  const note = (url: string, slug: string, label: string) => usedIn.set(canonicalUrl(url), [...(usedIn.get(canonicalUrl(url)) ?? []), { slug, label }]);
  for (const { slug, credential } of signed) {
    if (isTestSection(sectionIdOf(credential))) continue;
    for (const e of evidenceOf(credential).work) if (e.id) note(e.id, slug, `report no. ${numbers[slug] ?? '?'} (${titleOf(credential)})`);
  }
  for (const f of listSubmissionFiles()) {
    const s = loadSubmission(f);
    if (!s.submission || isTestSection(s.submission.section) || signed.some((c) => c.slug === s.slug)) continue;
    for (const e of s.submission.evidence) note(e.url, s.slug, `the accepted submission ${s.file}`);
  }
  return { numbers, signed, usedIn };
}

export type SummaryContext = ReturnType<typeof summaryContext>;

/** Warnings about a submission's evidence (links outside Physlib, links already used). */
export function evidenceWarnings(ctx: SummaryContext, submission: Submission, ownSlug?: string): string[] {
  const warnings: string[] = [];
  for (const e of submission.evidence) {
    if (!TRUSTED.some((t) => e.url.startsWith(t))) warnings.push(`Evidence outside Physlib's GitHub and Zulip; check it by hand: <${e.url}>`);
    if (isTestSection(submission.section)) continue;
    const elsewhere = (ctx.usedIn.get(canonicalUrl(e.url)) ?? []).filter((w) => w.slug !== ownSlug);
    if (elsewhere.length) warnings.push(`<${e.url}> is already evidence for ${elsewhere.map((w) => md(w.label)).join('; ')}`);
  }
  return warnings;
}

/** The summary of one submission, as Markdown lines. */
export function submissionSummary(
  ctx: SummaryContext,
  { heading, submission, errors, warnings, venue }: { heading: string; submission?: Submission; errors: string[]; warnings: string[]; venue: Venue },
): string[] {
  const out = [`### ${errors.length ? '❌' : '✅'} ${heading}`, ''];
  // Errors can echo text from the submission, so they are escaped like everything else.
  const line = (t: string) => md(t.replace(/\s+/g, ' '));
  errors.forEach((e) => out.push(`- **Error:** ${line(e)}`));
  warnings.forEach((w) => out.push(`- **Check:** ${w}`));
  if (submission) {
    if (isTestSection(submission.section)) {
      out.push(
        '',
        venue === 'issue'
          ? `**Test submission.** No approvals are needed: when a listed maintainer comments \`${ACCEPT_COMMAND}\`, it is signed as a test report that is not numbered or listed.`
          : '**Test submission.** No approvals are needed: merging this pull request is enough for it to be signed, as a test report that is not numbered or listed.',
      );
    }
    const previous = ctx.signed.filter(({ credential }) => recipientOf(credential).github?.toLowerCase() === submission.recipient.github.toLowerCase());
    out.push(
      '',
      submissionMarkdown(submission),
      '',
      previous.length
        ? `**Previous reports to @${submission.recipient.github}:** ${previous.map(({ slug, credential }) => `no. ${ctx.numbers[slug] ?? '?'} ${md(titleOf(credential))}`).join('; ')}`
        : `**Previous reports to @${submission.recipient.github}:** none`,
      '',
    );
  }
  return out;
}

/** What maintainers do next, at the end of the summary. */
export function maintainerNote(venue: Venue): string {
  const approve =
    venue === 'issue'
      ? `To approve, comment \`${ACCEPT_COMMAND} I have ${CONFLICT_DECLARATION}\`. When enough maintainers have, the submission is accepted and signed automatically.`
      : `To approve, submit an *Approve* review whose text includes “${CONFLICT_DECLARATION}”, then merge.`;
  return (
    `**For maintainers.** Check each criterion against the evidence. ${approve} ` +
    `Approvals from anyone credited by the submission or whoever opened this ${venue} do not count. ` +
    'You may ask for changes, or close a submission that does not clearly meet the criteria.'
  );
}
