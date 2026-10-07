/**
 * The review record of a merged submission, read from the GitHub API: which
 * pull request merged it, who approved it and who merged it. Used by
 * scripts/sign.ts before signing, and by the setup check to explain why a
 * submission is still unsigned.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isoSeconds, maintainerOf, SITE } from '../../src/lib/config';
import type { ReviewRecord } from '../../src/lib/credential';
import { approvalDecision, issueApprovalDecision, type IssueComment, type PullRequestReview } from '../../src/lib/review';
import { isAcceptComment, sameJson, submissionFromIssueBody } from '../../src/lib/issue-submission';
import { submissionSchema, type Submission } from '../../src/lib/submission';
import { ROOT } from './files';

export interface GitHubApi {
  get<T>(path: string): Promise<T>;
  /** All pages of a list endpoint (following the Link header). */
  all<T>(path: string): Promise<T[]>;
  /** POST, PATCH or PUT with a JSON body. */
  send<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown): Promise<T>;
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
}

/** GitHub's API (GITHUB_API_URL in Actions, or for tests). */
export const API_URL = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');

/** The REST API of one repository; paths are relative to /repos/<repo>. */
export function githubApi(repo: string, token?: string): GitHubApi {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const call = async <T>(url: string, init: RequestInit = {}) => {
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (!res.ok) throw new Error(`GitHub API ${url.replace(API_URL, '')}: HTTP ${res.status}`);
    return { res, data: (res.status === 204 ? undefined : await res.json()) as T };
  };
  return {
    async get<T>(path: string) {
      return (await call<T>(`${API_URL}/repos/${repo}${path}`)).data;
    },
    async all<T>(path: string) {
      const items: T[] = [];
      let url: string | undefined = `${API_URL}/repos/${repo}${path}${path.includes('?') ? '&' : '?'}per_page=100`;
      while (url) {
        const page: { res: Response; data: T[] } = await call<T[]>(url);
        items.push(...page.data);
        url = page.res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
      }
      return items;
    },
    async send<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown) {
      return (await call<T>(`${API_URL}/repos/${repo}${path}`, { method, body: JSON.stringify(body) })).data;
    },
    async graphql<T>(query: string, variables: Record<string, unknown>) {
      const { data } = await call<{ data?: T; errors?: { message: string }[] }>(`${API_URL}/graphql`, { method: 'POST', body: JSON.stringify({ query, variables }) });
      if (!data.data) throw new Error(`GitHub GraphQL: ${data.errors?.map((e) => e.message).join('; ') ?? 'no data'}`);
      return data.data;
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

// --- Submissions made as issues --------------------------------------------------------

export interface IssueJson {
  number: number;
  html_url: string;
  state: string;
  body: string | null;
  user: { login: string };
  labels: { name: string }[];
  pull_request?: unknown;
}

/** An issue, with when its text was last edited (only GraphQL has that). */
export async function fetchIssue(api: GitHubApi, repo: string, number: number) {
  const issue = await api.get<IssueJson>(`/issues/${number}`);
  const [owner, name] = repo.split('/');
  const { repository } = await api.graphql<{ repository: { issue: { lastEditedAt: string | null } | null } }>(
    'query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { lastEditedAt } } }',
    { owner, name, number },
  );
  return { ...issue, lastEditedAt: repository.issue?.lastEditedAt ?? null };
}

/**
 * The review record of a submission made as an issue, or why it may not be
 * signed: the issue must still hold exactly this submission, and its "/accept"
 * comments must meet the rules (see issueApprovalDecision in src/lib/review.ts).
 */
export async function issueReviewRecord(api: GitHubApi, repo: string, number: number, s: Submission): Promise<ReviewRecord | { refused: string }> {
  const issue = await fetchIssue(api, repo, number);
  if (issue.pull_request) return { refused: `#${number} is a pull request, not an issue` };
  const parsed = submissionFromIssueBody(issue.body);
  const fromIssue = parsed.data === undefined ? undefined : submissionSchema.safeParse(parsed.data);
  // "$schema" only says which format the file follows; it is not part of the submission.
  if (!fromIssue?.success || !sameJson({ ...fromIssue.data, $schema: undefined }, { ...s, $schema: undefined })) {
    return { refused: `the file differs from the submission in issue #${number}` };
  }

  const comments = await api.all<IssueComment>(`/issues/${number}/comments`);
  const decision = issueApprovalDecision(comments, { author: issue.user.login, lastEditedAt: issue.lastEditedAt }, s);
  if (!decision.ok) return { refused: `${decision.reason} (issue #${number})` };
  // Accepted when the last "/accept" from a listed maintainer on the current text was made.
  const accepted = comments.filter((c) => isAcceptComment(c.body) && c.user && maintainerOf(c.user) && (!issue.lastEditedAt || c.created_at > issue.lastEditedAt));
  const acceptedAt = accepted.map((c) => c.created_at).sort().at(-1) ?? new Date().toISOString();
  return {
    acceptedAt: isoSeconds(acceptedAt),
    pullRequest: { kind: 'issue', number, url: issue.html_url, author: issue.user.login },
    reviewers: decision.approvers,
  };
}
