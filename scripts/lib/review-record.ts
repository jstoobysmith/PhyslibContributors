/**
 * The review record of a merged submission, read from the GitHub API: which
 * pull request merged it, who approved it and who merged it. Used by
 * scripts/sign.ts before signing, and by the setup check to explain why a
 * submission is still unsigned.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isoSeconds, SITE } from '../../src/lib/config';
import type { ReviewRecord } from '../../src/lib/credential';
import { approvalDecision, type PullRequestReview } from '../../src/lib/review';
import type { Submission } from '../../src/lib/submission';
import { ROOT } from './files';

export interface GitHubApi {
  get<T>(path: string): Promise<T>;
  /** All pages of a list endpoint (following the Link header). */
  all<T>(path: string): Promise<T[]>;
}

/** The REST API of one repository; paths are relative to /repos/<repo>. */
export function githubApi(repo: string, token?: string): GitHubApi {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    async get<T>(path: string) {
      const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers });
      if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
      return res.json() as Promise<T>;
    },
    async all<T>(path: string) {
      const items: T[] = [];
      let url: string | undefined = `https://api.github.com/repos/${repo}${path}${path.includes('?') ? '&' : '?'}per_page=100`;
      while (url) {
        const res: Response = await fetch(url, { headers });
        if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
        items.push(...((await res.json()) as T[]));
        url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
      }
      return items;
    },
  };
}

/** The file's content at a commit, or undefined if it is not there. */
function gitShow(commit: string, file: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${commit}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
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
export async function reviewRecord(api: GitHubApi, file: string, s: Submission): Promise<ReviewRecord | { refused: string }> {
  const [latest] = await api.get<{ sha: string }[]>(`/commits?path=${encodeURIComponent(file)}&sha=${SITE.repository.branch}&per_page=1`);
  const pulls = latest ? await api.get<{ number: number; merged_at: string | null }[]>(`/commits/${latest.sha}/pulls`) : [];
  const merged = pulls.find((p) => p.merged_at);
  if (!merged) return { refused: 'its latest change did not come from a merged pull request' };

  const pr = await api.get<PullRequest>(`/pulls/${merged.number}`);
  if (pr.base.ref !== SITE.repository.branch) return { refused: `pull request #${pr.number} was not merged into ${SITE.repository.branch}` };
  const mergedContent = pr.merge_commit_sha ? gitShow(pr.merge_commit_sha, file) : undefined;
  if (mergedContent === undefined || mergedContent !== readFileSync(join(ROOT, file), 'utf8')) {
    return { refused: `the file differs from what pull request #${pr.number} merged` };
  }

  const reviews = await api.all<PullRequestReview>(`/pulls/${pr.number}/reviews`);
  const decision = approvalDecision(reviews, { author: pr.user.login, mergedBy: pr.merged_by?.login, headSha: pr.head.sha }, s);
  if (!decision.ok) return { refused: `${decision.reason} (pull request #${pr.number})` };
  return {
    acceptedAt: isoSeconds(pr.merged_at!),
    pullRequest: { number: pr.number, url: pr.html_url, author: pr.user.login },
    reviewers: decision.approvers,
    mergedBy: pr.merged_by?.login,
  };
}
