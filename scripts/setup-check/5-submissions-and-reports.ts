/**
 * Part 5: what is in the repository now. Every submission is valid, every
 * accepted submission is signed (or the reason it is not is shown), every
 * signed report verifies, and report numbers and revocations are consistent.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { issuerDidDocument, ISSUER_DID, isTestSection, SIGNING_KEY, SPECIMEN_SLUG, type Revocation } from '../../src/lib/config';
import { sectionIdOf, type OpenBadgeCredential } from '../../src/lib/credential';
import type { JsonObject } from '../../src/lib/dataIntegrity';
import { verifyCredential } from '../../src/lib/verify';
import { CREDENTIALS_DIR, listCredentials, listSubmissionFiles, loadSubmission, readIssueSubmissions, readJson, readReportNumbers, ROOT } from '../lib/files';
import { githubApi, issueReviewRecord, reviewRecord } from '../lib/review-record';
import { definePart, fail, listing, pass, plural, warn } from './checks';
import { REPO, TOKEN } from './context';

const revocations = readJson<Revocation[]>(join(ROOT, 'config', 'revocations.json'));
const revoked = revocations.map((r) => r.id);

/** Verifies a credential exactly as the site does, against this checkout's keys. */
const verifyLocally = (c: unknown) =>
  verifyCredential(c as JsonObject, { resolveDid: async () => issuerDidDocument(), revoked, trustedIssuers: [ISSUER_DID] });

const failedChecks = (r: Awaited<ReturnType<typeof verifyLocally>>) =>
  r.checks
    .filter((c) => c.status === 'fail')
    .map((c) => c.label.toLowerCase())
    .join(', ');

export default definePart({
  number: 5,
  title: 'Submissions and signed reports',
  covers: 'submissions/, public/credentials/, public/specimen.json and data/report-numbers.json.',
  file: import.meta.url,
  async run(check) {
    const submissions = listSubmissionFiles().map(loadSubmission);
    const credentials = listCredentials();
    const numbers = readReportNumbers();

    await check('5.1', 'Submission files', () => {
      const bad = submissions.filter((s) => s.errors.length);
      if (bad.length) {
        return fail(
          bad.map((s) => `${s.file}: ${s.errors.join('; ')}`).join(' | '),
          'Fix or remove these files with a pull request (npm run validate shows the same errors).',
        );
      }
      return pass(submissions.length ? `${plural(submissions.length, 'submission')}, all valid.` : 'No submissions yet.');
    });

    await check('5.2', 'Accepted submissions are signed', async () => {
      const unsigned = submissions.filter((s) => s.submission && !existsSync(join(CREDENTIALS_DIR, `${s.slug}.json`)));
      if (unsigned.length === 0) return pass(submissions.length ? 'Every accepted submission has a signed report.' : 'Nothing to sign yet.');
      // Ask GitHub why, with the same rules the signing workflow uses.
      const api = githubApi(REPO, TOKEN);
      const issueSubmissions = readIssueSubmissions();
      const reasons: string[] = [];
      for (const s of unsigned) {
        let why: string;
        try {
          const issue = issueSubmissions[s.slug];
          const record = issue ? await issueReviewRecord(api, REPO, issue, s.submission!) : await reviewRecord(api, s.file, s.submission!);
          why = 'refused' in record ? `not signed because ${record.refused}` : 'approved: it will be signed by the next “Sign and deploy” run';
        } catch (e) {
          why = `could not ask GitHub (${(e as Error).message})`;
        }
        reasons.push(`${s.file}: ${why}`);
      }
      return warn(
        `${plural(unsigned.length, 'submission')} on main ${unsigned.length === 1 ? 'is' : 'are'} not signed. ${reasons.join(' | ')}`,
        'A maintainer who is not involved approves it (on its issue, a “/accept” comment; on its pull request, an approving review, each with the conflict declaration), then re-run “Sign and deploy”. To withdraw a submission instead, delete its file with a pull request.',
      );
    });

    await check('5.3', 'Signed reports verify', async () => {
      if (credentials.length === 0) return pass('No signed reports yet.');
      const bad: string[] = [];
      for (const { slug, credential } of credentials) {
        const r = await verifyLocally(credential);
        if (!r.valid && !revoked.includes(credential.id)) bad.push(`${slug} (${failedChecks(r)})`);
      }
      return bad.length
        ? fail(`${listing(bad)} do${bad.length === 1 ? 'es' : ''} not verify.`, 'A signed file was edited, or its key was revoked. Restore it from git history, or re-sign (README: Keys, DID and the physlib.io DNS).')
        : pass(`All ${plural(credentials.length, 'signed report')} verify against config/keys.json.`);
    });

    await check('5.4', 'Report numbers', () => {
      // Test reports are not numbered.
      const missing = credentials.filter(({ slug, credential }) => numbers[slug] === undefined && !isTestSection(sectionIdOf(credential))).map((c) => c.slug);
      const values = Object.values(numbers);
      const duplicates = values.filter((n, i) => values.indexOf(n) !== i);
      const orphans = Object.keys(numbers).filter((slug) => !credentials.some((c) => c.slug === slug));
      if (missing.length || duplicates.length) {
        return fail(
          [missing.length && `no number for ${listing(missing)}`, duplicates.length && `numbers used twice: ${listing(duplicates.map(String))}`].filter(Boolean).join('; ') + '.',
          'data/report-numbers.json is written by the signing workflow; restore it from git history.',
        );
      }
      if (orphans.length) return warn(`Numbers for reports that do not exist: ${listing(orphans)}.`, 'Restore the missing files in public/credentials/ from git history.');
      return pass(values.length ? `Reports are numbered 1 to ${Math.max(...values)}, with no repeats.` : 'No reports numbered yet.');
    });

    await check('5.5', 'Reports match submissions', () => {
      const withoutSubmission = credentials.filter(({ slug }) => !submissions.some((s) => s.slug === slug)).map((c) => c.slug);
      return withoutSubmission.length
        ? warn(`Signed reports without a submission file: ${listing(withoutSubmission)}.`, 'Restore the submission files from git history.')
        : pass('Every signed report has its submission file.');
    });

    await check('5.6', 'Revocations', () => {
      const ids = new Set(credentials.map(({ credential }) => credential.id));
      const unknown = revocations.filter((r) => !ids.has(r.id)).map((r) => r.id);
      return unknown.length
        ? warn(`config/revocations.json lists reports that do not exist: ${listing(unknown)}.`, 'Check the ids against public/credentials/.')
        : pass(revocations.length ? `${plural(revocations.length, 'revoked report')}, all known.` : 'No revocations.');
    });

    await check('5.7', 'Specimen report', async () => {
      const path = join(ROOT, 'public', 'specimen.json');
      if (!existsSync(path)) return fail('public/specimen.json is missing.', 'Run “Sign and deploy” to sign it.');
      const specimen = readJson<OpenBadgeCredential>(path);
      const r = await verifyLocally(specimen);
      if (!r.valid) return fail(`The specimen does not verify (${failedChecks(r)}).`, 'Re-run “Sign and deploy” with “Re-sign every report” ticked.');
      const keyId = specimen.proof?.verificationMethod.split('#')[1];
      return keyId !== SIGNING_KEY?.id
        ? warn(`The specimen is signed with ${keyId}, not ${SIGNING_KEY?.id}.`, 'The next “Sign and deploy” run re-signs it.')
        : pass(`public/specimen.json (${SPECIMEN_SLUG}) verifies and is signed with ${keyId}.`);
    });
  },
});
