import { SITE, SUBMISSION_BRANCH_PREFIX, SUBMISSION_LABEL, SUBMISSION_TITLE_PREFIX, urls } from '../lib/config';
import { submissionMarkdown, type Submission } from '../lib/submission';

/**
 * Two ways to turn a submission into a pull request on the reports repository:
 *
 * 1. `newFileUrl`: GitHub's own "create new file" page, pre-filled. No token
 *    needed; GitHub forks the repository for the user and offers to open a PR.
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

export function newFileUrl(slug: string, s: Submission) {
  const { owner, name, branch } = SITE.repository;
  const params = new URLSearchParams({ filename: submissionPath(slug), value: submissionJson(s) });
  return `https://github.com/${owner}/${name}/new/${branch}?${params}`;
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

// --- Open submissions (read-only, no token) -------------------------------------

export interface OpenSubmission {
  number: number;
  title: string;
  url: string;
  user: string;
  createdAt: string;
}

/** Open submission pull requests ("under review"), read from the public GitHub API. */
export async function fetchUnderReview(): Promise<OpenSubmission[]> {
  const { owner, name } = SITE.repository;
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls?state=open&per_page=50`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`);
  const pulls = (await res.json()) as {
    number: number;
    title: string;
    html_url: string;
    created_at: string;
    user: { login: string };
    head: { ref: string };
    labels: { name: string }[];
  }[];
  return pulls
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
}
