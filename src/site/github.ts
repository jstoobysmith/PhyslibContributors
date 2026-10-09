import { SITE, SUBMISSION_BRANCH_PREFIX, SUBMISSION_LABEL, SUBMISSION_TITLE_PREFIX, urls } from '../lib/config';
import { ISSUE_FIELD, ISSUE_FORM } from '../lib/issue-submission';
import { submissionMarkdown, type Submission } from '../lib/submission';

/**
 * The usual way to send a submission is as an issue (`issueUrl`): GitHub's
 * new-issue page with the submission form filled in, so no fork is needed;
 * `findSubmissionIssue` finds it afterwards. A maintainer accepts it there
 * (see src/lib/issue-submission.ts).
 *
 * Two other ways turn a submission into a pull request on the reports repository:
 *
 * 1. In the browser, without a token (see SendOnGitHub.tsx):
 *    the contributor forks the repository (`forkUrl`), adds the file to their
 *    fork on GitHub's pre-filled "create new file" page (`newFileUrl`), and
 *    opens the pull request (`pullRequestUrl`). `findFork` and `changedInFork` read
 *    the public API to show how far they have got.
 * 2. `openSubmissionPullRequest`: automated with a personal access token. The
 *    token is held in memory only (never stored) and sent only to api.github.com.
 */

export const submissionPath = (slug: string) => `submissions/${slug}.json`;

export function submissionJson(s: Submission) {
  return JSON.stringify({ $schema: urls.submissionSchema(), ...s }, null, 2) + '\n';
}

export const prTitle = (s: Submission) => `${SUBMISSION_TITLE_PREFIX}${s.title}`;

export function prBody(s: Submission) {
  return [
    submissionMarkdown(s),
    '',
    '---',
    '_Merging this pull request accepts the report. The signing workflow then signs it as an Open Badges 3.0 credential, provided the required maintainer approvals are present._',
  ].join('\n');
}

const upstreamRepo = () => `${SITE.repository.owner}/${SITE.repository.name}`;

/** GitHub's "create new file" page in `repo` (the reports repository or a fork of it), with the submission filled in. */
export function newFileUrl(slug: string, s: Submission, repo = upstreamRepo()) {
  const params = new URLSearchParams({ filename: submissionPath(slug), value: submissionJson(s) });
  return `https://github.com/${repo}/new/${SITE.repository.branch}?${params}`;
}

/** The JSON put into the issue form: the submission without the $schema line. */
export const issueJson = (s: Submission) => JSON.stringify(s, null, 2);

/** GitHub's new-issue page with the submission form filled in; without `s`, the empty form. */
export function issueUrl(s?: Submission) {
  const params = new URLSearchParams({ template: ISSUE_FORM, title: s ? prTitle(s) : SUBMISSION_TITLE_PREFIX });
  if (s) params.set(ISSUE_FIELD, issueJson(s));
  return `https://github.com/${upstreamRepo()}/issues/new?${params}`;
}

/** The submission issue that `login` opened with this title, if any (newest first). */
export async function findSubmissionIssue(login: string, s: Submission): Promise<{ url: string; number: number; open: boolean } | undefined> {
  const issues =
    (await publicApi<{ html_url: string; number: number; title: string; state: string; pull_request?: unknown }[]>(
      `/repos/${upstreamRepo()}/issues?creator=${encodeURIComponent(login)}&labels=${SUBMISSION_LABEL}&state=all&per_page=20`,
    )) ?? [];
  const mine = issues.find((i) => !i.pull_request && i.title.trim() === prTitle(s).trim());
  return mine && { url: mine.html_url, number: mine.number, open: mine.state === 'open' };
}

/** GitHub's page for uploading files into submissions/ of `repo`: the fallback when a submission is too long for a link. */
export const uploadUrl = (repo: string) => `https://github.com/${repo}/upload/${SITE.repository.branch}/submissions`;

/** GitHub's "Create a new fork" page for the reports repository. */
export const forkUrl = () => `https://github.com/${upstreamRepo()}/fork`;

/** GitHub's "Open a pull request" page, from the main branch of a fork, with the title filled in. */
export function pullRequestUrl(fork: Fork, s: Submission) {
  const { branch } = SITE.repository;
  const params = new URLSearchParams({
    expand: '1',
    title: prTitle(s),
    body: 'A submission made with the form on the Physlib Contributions site. An automatic check will post a summary of it here.',
  });
  return `https://github.com/${upstreamRepo()}/compare/${branch}...${fork.owner}:${fork.name}:${branch}?${params}`;
}

// --- Progress through the fork steps (public API, no token) ----------------------

export interface Fork {
  owner: string;
  name: string;
  fullName: string;
}

/**
 * Calls the public API. Undefined for "not found"; throws for anything else,
 * including the hourly limit on calls without a token (60 per address).
 */
async function publicApi<T>(path: string): Promise<T | undefined> {
  // GitHub caches public responses for a minute; the extra parameter asks for a fresh answer.
  const res = await fetch(`https://api.github.com${path}${path.includes('?') ? '&' : '?'}fresh=${Date.now()}`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub’s limit on checks was reached' : `GitHub: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface RepoJson {
  name: string;
  full_name: string;
  owner: { login: string };
  fork?: boolean;
  parent?: { full_name: string };
}

const toFork = (r: RepoJson): Fork => ({ owner: r.owner.login, name: r.name, fullName: r.full_name });

/** The user's fork of the reports repository, if they have one (it may have been renamed). */
export async function findFork(login: string): Promise<Fork | undefined> {
  const { owner, name } = SITE.repository;
  const same = await publicApi<RepoJson>(`/repos/${login}/${name}`);
  if (same?.fork && same.parent?.full_name.toLowerCase() === upstreamRepo().toLowerCase()) return toFork(same);
  for (let page = 1; page <= 5; page++) {
    const forks = (await publicApi<RepoJson[]>(`/repos/${owner}/${name}/forks?per_page=100&page=${page}`)) ?? [];
    const mine = forks.find((f) => f.owner.login.toLowerCase() === login.toLowerCase());
    if (mine) return toFork(mine);
    if (forks.length < 100) break;
  }
  return undefined;
}

/**
 * The files changed on the fork's main branch that are not in the reports
 * repository. A pull request from the fork would contain exactly these: the
 * new submission, and possibly older changes (an earlier submission, say).
 */
export async function changedInFork(fork: Fork): Promise<string[]> {
  const { branch } = SITE.repository;
  const c = await publicApi<{ files?: { filename: string }[] }>(`/repos/${upstreamRepo()}/compare/${branch}...${fork.owner}:${fork.name}:${branch}`);
  if (!c) throw new Error('GitHub could not compare your fork with the repository');
  return (c.files ?? []).map((f) => f.filename);
}

class GitHub {
  constructor(private token: string) {}
  async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw Object.assign(new Error(`GitHub: ${body.message ?? res.statusText} (${res.status}, ${path})`), { status: res.status });
    }
    return res.status === 204 ? (undefined as T) : res.json();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function base64Utf8(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export async function whoAmI(token: string) {
  return new GitHub(token).call<{ login: string; name: string | null }>('/user');
}

export async function openSubmissionPullRequest(
  token: string,
  slug: string,
  submission: Submission,
  progress: (step: string) => void,
): Promise<string> {
  const gh = new GitHub(token);
  const { owner, name, branch } = SITE.repository;
  const upstream = `${owner}/${name}`;

  progress('Checking your GitHub account');
  const me = await gh.call<{ login: string }>('/user');
  const repo = await gh.call<{ permissions?: { push?: boolean } }>(`/repos/${upstream}`);

  // Push to the reports repository directly if allowed, otherwise via a fork.
  let target = upstream;
  if (!repo.permissions?.push) {
    progress('Forking the reports repository');
    const fork = await gh.call<{ full_name: string }>(`/repos/${upstream}/forks`, {
      method: 'POST',
      body: JSON.stringify({ default_branch_only: true }),
    });
    target = fork.full_name;
    for (let i = 0; i < 15; i++) {
      try {
        await gh.call(`/repos/${target}/git/ref/heads/${branch}`);
        break;
      } catch {
        await sleep(2000);
      }
    }
    await gh.call(`/repos/${target}/merge-upstream`, { method: 'POST', body: JSON.stringify({ branch }) }).catch(() => undefined);
  }

  progress('Creating a branch');
  const base = await gh.call<{ object: { sha: string } }>(`/repos/${upstream}/git/ref/heads/${branch}`);
  let head = `${SUBMISSION_BRANCH_PREFIX}${slug}`;
  try {
    await gh.call(`/repos/${target}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${head}`, sha: base.object.sha }) });
  } catch (e) {
    if ((e as { status?: number }).status !== 422) throw e;
    head = `${head}-${Date.now().toString(36)}`; // branch exists: a previous attempt
    await gh.call(`/repos/${target}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${head}`, sha: base.object.sha }) });
  }

  progress('Committing the submission');
  await gh.call(`/repos/${target}/contents/${submissionPath(slug)}`, {
    method: 'PUT',
    body: JSON.stringify({ message: prTitle(submission), content: base64Utf8(submissionJson(submission)), branch: head }),
  });

  progress('Opening the pull request');
  const pr = await gh.call<{ html_url: string }>(`/repos/${upstream}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: prTitle(submission),
      head: target === upstream ? head : `${me.login}:${head}`,
      base: branch,
      body: prBody(submission),
      maintainer_can_modify: true,
    }),
  });
  return pr.html_url;
}

/** The open pull request from the fork's main branch to the reports repository, if there is one. */
export async function openPullRequestFrom(fork: Fork): Promise<string | undefined> {
  const { branch } = SITE.repository;
  const pulls = await publicApi<{ html_url: string }[]>(`/repos/${upstreamRepo()}/pulls?state=open&head=${fork.owner}:${branch}`);
  return pulls?.[0]?.html_url;
}

// --- Open submissions (read-only, no token) -------------------------------------

export interface OpenSubmission {
  number: number;
  title: string;
  url: string;
  user: string;
  createdAt: string;
}

/** Open submissions ("under review"), issues and pull requests, read from the public GitHub API. */
export async function fetchUnderReview(): Promise<OpenSubmission[]> {
  const { owner, name } = SITE.repository;
  const get = async <T,>(path: string) => {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/${path}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  const issues = (
    await get<{ number: number; title: string; html_url: string; created_at: string; user: { login: string }; pull_request?: unknown }[]>(
      `issues?state=open&labels=${SUBMISSION_LABEL}&per_page=50`,
    )
  )
    .filter((i) => !i.pull_request)
    .map((i) => ({ number: i.number, title: i.title.replace(SUBMISSION_TITLE_PREFIX, ''), url: i.html_url, user: i.user.login, createdAt: i.created_at }));
  const pulls = await get<
    { number: number; title: string; html_url: string; created_at: string; user: { login: string }; head: { ref: string }; labels: { name: string }[] }[]
  >('pulls?state=open&per_page=50');
  const submissionPulls = pulls
    .filter(
      (p) =>
        p.labels.some((l) => l.name === SUBMISSION_LABEL) ||
        p.head.ref.startsWith(SUBMISSION_BRANCH_PREFIX) ||
        p.title.startsWith(SUBMISSION_TITLE_PREFIX),
    )
    .map((p) => ({
      number: p.number,
      title: p.title.replace(SUBMISSION_TITLE_PREFIX, ''),
      url: p.html_url,
      user: p.user.login,
      createdAt: p.created_at,
    }));
  return [...issues, ...submissionPulls].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
