/**
 * Looks up the titles of GitHub evidence links for the workflows (see
 * src/lib/evidence-titles.ts). In a workflow, GITHUB_TOKEN allows 1,000
 * calls an hour; without a token, nothing is looked up.
 */
import type { EvidenceKind } from '../../src/lib/config';
import { githubEvidenceTitle, githubRef } from '../../src/lib/evidence-titles';
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
