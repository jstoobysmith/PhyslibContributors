/**
 * Signs accepted submissions: every submission merged into the main branch
 * that does not yet have a credential is turned into an Open Badges 3.0
 * credential, signed with the Physlib Contributions key, and given the next
 * award number.
 *
 * In GitHub Actions the key comes from the OB_SIGNING_KEY secret and the review
 * record (pull request, approvals, merger) from the GitHub API. An award is only
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
  type Revocation,
  KEYS,
  SITE,
  SITE_URL,
  SPECIMEN_SLUG,
  urls,
  verificationMethodId,
} from '../src/lib/config';
import { nextAwardNumber } from '../src/lib/awards';
import { buildCredential, rehomeCredential, type OpenBadgeCredential, type ReviewRecord } from '../src/lib/credential';
import { publicKeyFor, sign, verifySignature, type JsonObject } from '../src/lib/dataIntegrity';
import { approvalDecision, type PullRequestReview } from '../src/lib/review';
import type { Submission } from '../src/lib/submission';
import {
  AWARD_NUMBERS_FILE,
  CREDENTIALS_DIR,
  listSubmissionFiles,
  loadSubmission,
  readAwardNumbers,
  readJson,
  ROOT,
  writeJson,
} from './lib/files';
import { option } from './lib/args';

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

const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** All pages of a list endpoint (following the Link header). */
async function ghAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | undefined = `https://api.github.com/repos/${repo}${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  while (url) {
    const res: Response = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
    items.push(...((await res.json()) as T[]));
    url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  return items;
}

/** The file's content at a commit, or undefined if it is not there. */
function gitShow(commit: string, file: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${commit}:${file}`], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return undefined;
  }
}


function gitDate(file: string): string | undefined {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%cI', '--', file], { cwd: ROOT, encoding: 'utf8' });
    return out.trim().split('\n').pop() || undefined;
  } catch {
    return undefined;
  }
}

interface PullRequest {
  number: number;
  html_url: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  user: { login: string };
  merged_by: { login: string } | null;
  head: { sha: string };
  base: { ref: string };
}

/**
 * The review record of a submission, or the reason it may not be signed yet
 * (see src/lib/review.ts). The approvals must be on the pull request that last
 * changed the file, on its final commit, and the file on the main branch must
 * be exactly what that pull request merged.
 */
async function reviewRecord(file: string, s: Submission): Promise<ReviewRecord | { refused: string }> {
  if (!reviewCheck) return { acceptedAt: isoSeconds(gitDate(file) ?? new Date()) };
  const [latest] = await gh<{ sha: string }[]>(`/commits?path=${encodeURIComponent(file)}&sha=${SITE.repository.branch}&per_page=1`);
  const pulls = latest ? await gh<{ number: number; merged_at: string | null }[]>(`/commits/${latest.sha}/pulls`) : [];
  const merged = pulls.find((p) => p.merged_at);
  if (!merged) return { refused: 'its latest change did not come from a merged pull request' };

  const pr = await gh<PullRequest>(`/pulls/${merged.number}`);
  if (pr.base.ref !== SITE.repository.branch) return { refused: `pull request #${pr.number} was not merged into ${SITE.repository.branch}` };
  const mergedContent = pr.merge_commit_sha ? gitShow(pr.merge_commit_sha, file) : undefined;
  if (mergedContent === undefined || mergedContent !== readFileSync(join(ROOT, file), 'utf8')) {
    return { refused: `the file differs from what pull request #${pr.number} merged` };
  }

  const reviews = await ghAll<PullRequestReview>(`/pulls/${pr.number}/reviews`);
  const decision = approvalDecision(reviews, { author: pr.user.login, mergedBy: pr.merged_by?.login, headSha: pr.head.sha }, s);
  if (!decision.ok) return { refused: decision.reason };
  return {
    acceptedAt: isoSeconds(pr.merged_at!),
    pullRequest: { number: pr.number, url: pr.html_url, author: pr.user.login },
    reviewers: decision.approvers,
    mergedBy: pr.merged_by?.login,
  };
}

/**
 * Before re-signing, the existing signature must be valid under one of our
 * published (non-revoked) keys, so a hand-edited file never gets a genuine
 * signature. Revoked awards are not re-signed.
 */
async function mayResign(c: OpenBadgeCredential): Promise<string | undefined> {
  if (revoked.has(c.id)) return 'it is revoked';
  const keyId = c.proof?.verificationMethod.split('#')[1];
  const k = KEYS.find((key) => key.id === keyId && key.status !== 'revoked');
  if (!k) return `its key (${keyId ?? 'none'}) is not a published key`;
  if (!(await verifySignature(c as unknown as JsonObject, k.publicKeyMultibase))) return 'its current signature does not verify (was it edited?)';
  return undefined;
}

const numbers = readAwardNumbers();
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
  const record = await reviewRecord(file, submission);
  if ('refused' in record) {
    console.error(`::error file=${file}::Not signed: ${record.refused}.`);
    return false;
  }
  writeJson(path, await sign(buildCredential(slug, submission, record), { secretKeyMultibase, verificationMethod }));
  numbers[slug] ??= nextAwardNumber(numbers);
  writeJson(AWARD_NUMBERS_FILE, numbers); // saved with each award, in case a later one fails
  console.log(`signed ${slug} as award no. ${numbers[slug]}`);
  return true;
}

/** The specimen award (examples/) is re-signed whenever the signing key changes. */
async function signSpecimen() {
  const path = join(ROOT, 'public', 'specimen.json');
  const existing = existsSync(path) ? readJson<OpenBadgeCredential>(path) : undefined;
  if (existing?.proof?.verificationMethod === verificationMethod && !resignAll) return;
  const submission = readJson<Submission>(join(ROOT, 'examples', 'specimen.submission.json'));
  const unsigned = buildCredential(SPECIMEN_SLUG, submission, { acceptedAt: submission.submittedAt });
  writeJson(path, await sign(unsigned, { secretKeyMultibase, verificationMethod }));
  console.log(`signed the specimen award (${urls.credential(SPECIMEN_SLUG)})`);
}

await signSpecimen();
let count = 0;
for (const file of listSubmissionFiles()) {
  const loaded = loadSubmission(file);
  if (!loaded.submission || loaded.errors.length) {
    // Reported, but does not stop the other awards from being signed.
    console.error(`::error file=${file}::Invalid submission on the main branch, not signed: ${loaded.errors.join('; ')}`);
    continue;
  }
  try {
    if (await signSubmission(loaded.slug, loaded.file, loaded.submission)) count++;
  } catch (e) {
    console.error(`::error file=${file}::Could not sign: ${(e as Error).message}`);
  }
}
writeJson(AWARD_NUMBERS_FILE, numbers);
console.log(`${count} credential(s) ${resignAll ? 're-signed' : 'signed'} with ${verificationMethod}`);
