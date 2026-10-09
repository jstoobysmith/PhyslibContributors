/**
 * Looks up the titles of GitHub evidence links for the workflows (see
 * src/lib/evidence-titles.ts). In a workflow, GITHUB_TOKEN allows 1,000
 * calls an hour; without a token, nothing is looked up.
 */
import type { EvidenceKind } from '../../src/lib/config';
import { githubEvidenceTitle, githubRef } from '../../src/lib/evidence-titles';
import type { PullRequestPeople } from '../../src/lib/submission';
import { API_URL } from './review-record';

/** At most this many links are looked up at once. */
const MAX_LOOKUPS = 100;

export interface TitleLookup {
  /** Link -> the evidence title to show. */
  titles: Map<string, string>;
  /** Links to pull requests, issues or commits that do not exist. */
  missing: string[];
}

export const githubToken = () => process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;

export async function lookUpEvidenceTitles(evidence: { url: string; kind: EvidenceKind }[], token = githubToken()): Promise<TitleLookup> {
  const titles = new Map<string, string>();
  const missing: string[] = [];
  if (!token) return { titles, missing };
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  for (const e of evidence.slice(0, MAX_LOOKUPS)) {
    const ref = githubRef(e.url);
    if (!ref || titles.has(e.url)) continue;
    // Pull requests are issues too, so one endpoint gives both their titles.
    const path = ref.type === 'commit' ? `commits/${ref.id}` : `issues/${ref.id}`;
    try {
      const res = await fetch(`${API_URL}/repos/${ref.owner}/${ref.repo}/${path}`, { headers, signal: AbortSignal.timeout(15_000) });
      if (res.status === 404 || res.status === 422) {
        missing.push(e.url);
        continue;
      }
      if (!res.ok) continue; // e.g. a private repository: keep the automatic name
      const data = (await res.json()) as { title?: string; commit?: { message?: string } };
      const title = ref.type === 'commit' ? data.commit?.message : data.title;
      if (title?.trim()) titles.set(e.url, githubEvidenceTitle(ref, e.kind, title));
    } catch {
      // Network trouble: keep the automatic name.
    }
  }
  return { titles, missing };
}

/** At most this many pull requests have their author and reviewers looked up (two calls each). */
const MAX_PEOPLE_LOOKUPS = 60;

/**
 * Who opened each pull request given as evidence, and who reviewed it, for the
 * maintainers' summary. Bots are left out of the reviewers.
 */
export async function lookUpPullRequestPeople(urls: string[], token = githubToken()): Promise<Map<string, PullRequestPeople>> {
  const people = new Map<string, PullRequestPeople>();
  if (!token) return people;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const get = async <T>(path: string): Promise<T | undefined> => {
    const res = await fetch(`${API_URL}${path}`, { headers, signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
    return res?.ok ? ((await res.json()) as T) : undefined;
  };
  for (const url of [...new Set(urls)].slice(0, MAX_PEOPLE_LOOKUPS)) {
    const ref = githubRef(url);
    if (ref?.type !== 'pull') continue;
    const base = `/repos/${ref.owner}/${ref.repo}/pulls/${ref.id}`;
    const pr = await get<{ user: { login: string } | null }>(base);
    if (!pr?.user) continue;
    const reviews = (await get<{ user: { login: string; type?: string } | null }[]>(`${base}/reviews?per_page=100`)) ?? [];
    const reviewers = [
      ...new Set(reviews.filter((r) => r.user && r.user.type !== 'Bot' && !r.user.login.endsWith('[bot]') && r.user.login !== pr.user!.login).map((r) => r.user!.login)),
    ];
    people.set(url, { author: pr.user.login, reviewers });
  }
  return people;
}
