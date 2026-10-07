/**
 * Signs accepted submissions: every submission merged into the main branch
 * that does not yet have a credential is turned into an Open Badges 3.0
 * credential, signed with the Physlib Contributions key, and given the next
 * report number (test submissions are signed but not numbered).
 *
 * In GitHub Actions the key comes from the OB_SIGNING_KEY secret and the review
 * record from the GitHub API: the pull request that merged the submission
 * (approvals, merger), or, for submissions accepted on an issue
 * (data/issue-submissions.json), the issue and its "/accept" comments. A report is only
 * signed if enough maintainers (config/maintainers.json) other than the
 * recipient, the nominator and the pull request author approved it.
 *
 * Locally, for testing:
 *   npm run sign -- --key .keys/key-1.json --no-review-check
 * After a key rotation or a move to a new domain (re-signs without changing content):
 *   npm run sign -- --key .keys/key-2.json --resign-all
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canSign,
  isoSeconds,
  isTestSection,
  type Revocation,
  KEYS,
  SITE,
  SITE_URL,
  SPECIMEN_SLUG,
  urls,
  verificationMethodId,
} from '../src/lib/config';
import { nextReportNumber } from '../src/lib/reports';
import { buildCredential, rehomeCredential, type OpenBadgeCredential } from '../src/lib/credential';
import { publicKeyFor, sign, verifySignature, type JsonObject } from '../src/lib/dataIntegrity';
import type { Submission } from '../src/lib/submission';
import {
  REPORT_NUMBERS_FILE,
  CREDENTIALS_DIR,
  listSubmissionFiles,
  loadSubmission,
  readIssueSubmissions,
  readReportNumbers,
  readJson,
  ROOT,
  writeJson,
} from './lib/files';
import { option } from './lib/args';
import { githubApi, issueReviewRecord, reviewRecord } from './lib/review-record';

const args = process.argv.slice(2);
const resignAll = args.includes('--resign-all');
const reviewCheck = !args.includes('--no-review-check');

// --- Signing key -------------------------------------------------------------------
const keyFile = option(args, '--key');
const rawKey = keyFile ? readFileSync(keyFile, 'utf8') : process.env.OB_SIGNING_KEY;
if (!rawKey) {
  console.warn('::warning::No signing key (OB_SIGNING_KEY secret or --key). Accepted submissions stay unsigned until one is configured.');
  process.exit(0);
}
let secretKeyMultibase: string;
let publicKeyMultibase: string;
try {
  secretKeyMultibase = (JSON.parse(rawKey) as { secretKeyMultibase: string }).secretKeyMultibase;
  publicKeyMultibase = publicKeyFor(secretKeyMultibase);
} catch {
  // Never echo any part of the secret.
  console.error('::error::The signing key is not in the expected format (the JSON file written by npm run keygen).');
  process.exit(1);
}
const key = KEYS.find((k) => k.publicKeyMultibase === publicKeyMultibase);
if (!key || !canSign(key.status)) {
  console.error(
    `::error::This signing key is ${key ? key.status : 'not listed in config/keys.json'}. Only active keys published in the DID document may sign.`,
  );
  process.exit(1);
}
const verificationMethod = verificationMethodId(key.id);

// --- Review record from GitHub -------------------------------------------------------
const repo = process.env.GITHUB_REPOSITORY ?? `${SITE.repository.owner}/${SITE.repository.name}`;
const token = process.env.GITHUB_TOKEN;
if (reviewCheck && !token) {
  console.error('::error::GITHUB_TOKEN is needed to check who approved each submission (or pass --no-review-check when testing locally).');
  process.exit(1);
}

const api = githubApi(repo, token);

function gitDate(file: string): string | undefined {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%cI', '--', file], { cwd: ROOT, encoding: 'utf8' });
    return out.trim().split('\n').pop() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Before re-signing, the existing signature must be valid under one of our
 * published (non-revoked) keys, so a hand-edited file never gets a genuine
 * signature. Revoked reports are not re-signed.
 */
async function mayResign(c: OpenBadgeCredential): Promise<string | undefined> {
  if (revoked.has(c.id)) return 'it is revoked';
  const keyId = c.proof?.verificationMethod.split('#')[1];
  const k = KEYS.find((key) => key.id === keyId && key.status !== 'revoked');
  if (!k) return `its key (${keyId ?? 'none'}) is not a published key`;
  if (!(await verifySignature(c as unknown as JsonObject, k.publicKeyMultibase))) return 'its current signature does not verify (was it edited?)';
  return undefined;
}

const numbers = readReportNumbers();
const issueSubmissions = readIssueSubmissions();
const revoked = new Set(readJson<Revocation[]>(join(ROOT, 'config', 'revocations.json')).map((r) => r.id));

async function signSubmission(slug: string, file: string, submission: Submission): Promise<boolean> {
  const path = join(CREDENTIALS_DIR, `${slug}.json`);
  if (existsSync(path)) {
    if (!resignAll) return false;
    const existing = readJson<OpenBadgeCredential>(path);
    const problem = await mayResign(existing);
    if (problem) {
      console.error(`::error file=${file}::Not re-signed: ${problem}.`);
      return false;
    }
    writeJson(path, await sign(rehomeCredential(existing, SITE_URL), { secretKeyMultibase, verificationMethod }));
    console.log(`re-signed ${slug}`);
    return true;
  }
  const issue = issueSubmissions[slug];
  const record = !reviewCheck
    ? { acceptedAt: isoSeconds(gitDate(file) ?? new Date()) }
    : issue
      ? await issueReviewRecord(api, repo, issue, submission) // accepted on an issue
      : await reviewRecord(api, file, submission); // merged as a pull request
  if ('refused' in record) {
    console.error(`::error file=${file}::Not signed: ${record.refused}.`);
    return false;
  }
  writeJson(path, await sign(buildCredential(slug, submission, record), { secretKeyMultibase, verificationMethod }));
  if (isTestSection(submission.section)) {
    console.log(`signed ${slug} (a test report, not numbered)`);
    return true;
  }
  numbers[slug] ??= nextReportNumber(numbers);
  writeJson(REPORT_NUMBERS_FILE, numbers); // saved with each report, in case a later one fails
  console.log(`signed ${slug} as report no. ${numbers[slug]}`);
  return true;
}

/** The specimen report (examples/) is re-signed whenever the signing key changes. */
async function signSpecimen() {
  const path = join(ROOT, 'public', 'specimen.json');
  const existing = existsSync(path) ? readJson<OpenBadgeCredential>(path) : undefined;
  if (existing?.proof?.verificationMethod === verificationMethod && !resignAll) return;
  const submission = readJson<Submission>(join(ROOT, 'examples', 'specimen.submission.json'));
  const unsigned = buildCredential(SPECIMEN_SLUG, submission, { acceptedAt: submission.submittedAt });
  writeJson(path, await sign(unsigned, { secretKeyMultibase, verificationMethod }));
  console.log(`signed the specimen report (${urls.credential(SPECIMEN_SLUG)})`);
}

await signSpecimen();
let count = 0;
for (const file of listSubmissionFiles()) {
  const loaded = loadSubmission(file);
  if (!loaded.submission || loaded.errors.length) {
    // Reported, but does not stop the other reports from being signed.
    console.error(`::error file=${file}::Invalid submission on the main branch, not signed: ${loaded.errors.join('; ')}`);
    continue;
  }
  try {
    if (await signSubmission(loaded.slug, loaded.file, loaded.submission)) count++;
  } catch (e) {
    console.error(`::error file=${file}::Could not sign: ${(e as Error).message}`);
  }
}
writeJson(REPORT_NUMBERS_FILE, numbers);
console.log(`${count} credential(s) ${resignAll ? 're-signed' : 'signed'} with ${verificationMethod}`);
