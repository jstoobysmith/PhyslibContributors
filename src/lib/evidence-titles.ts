/**
 * Titles for evidence links, given by the workflows rather than typed in.
 *
 * Contributors only give links. For links to GitHub pull requests, issues and
 * commits, the workflows look up the title (scripts/lib/evidence-titles.ts,
 * with the token GitHub gives workflows) and the report shows it, e.g.
 * "Review of #412: Add the Lorentz group" rather than "Review of pull request #412".
 * A title given in the submission is kept as it is.
 */
import { EVIDENCE_KINDS, SITE, type EvidenceKind } from './config';
import type { OpenBadgeCredential } from './credential';
import type { JsonObject } from './dataIntegrity';
import { evidenceTitle, type Evidence, type Submission } from './submission';

/** A GitHub pull request, issue or commit, from its link. */
export interface GitHubRef {
  owner: string;
  repo: string;
  type: 'pull' | 'issues' | 'commit';
  /** The number, or the commit hash. */
  id: string;
}

export function githubRef(url: string): GitHubRef | undefined {
  const m = url.match(/^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues|commit)\/([0-9a-f]+)(?:[/?#].*)?$/i);
  if (!m) return undefined;
  const [, owner, repo, type, id] = m;
  if (type !== 'commit' && !/^\d+$/.test(id)) return undefined;
  return { owner, repo, type: type.toLowerCase() as GitHubRef['type'], id };
}

/**
 * The title of a piece of evidence from its pull request's or issue's title, or
 * its commit's message. Links outside Physlib's repository name their repository.
 */
export function githubEvidenceTitle(ref: GitHubRef, kind: EvidenceKind, title: string): string {
  const repo = `${ref.owner}/${ref.repo}`.toLowerCase() === SITE.physlib.repository.toLowerCase() ? '' : `${ref.owner}/${ref.repo}`;
  const text = title.split('\n')[0].replace(/\p{Cc}+/gu, ' ').trim();
  const name =
    ref.type === 'commit'
      ? `Commit ${repo ? `${repo}@` : ''}${ref.id.slice(0, 7)}: ${text}`
      : `${ref.type === 'issues' ? 'Issue ' : kind === 'pull-request-review' ? 'Review of ' : ''}${repo}#${ref.id}: ${text}`;
  return name.length > 200 ? `${name.slice(0, 199)}…` : name;
}

/** Evidence that gets its title from GitHub: links to GitHub that were given no title. */
export function untitledGitHubEvidence(evidence: Pick<Evidence, 'url' | 'kind' | 'title'>[]): Pick<Evidence, 'url' | 'kind'>[] {
  return evidence.filter((e) => !e.title && githubRef(e.url)).map(({ url, kind }) => ({ url, kind }));
}

/** The submission with the titles found (by link) given to evidence that has none. */
export function withEvidenceTitles(s: Submission, titles: Map<string, string>): Submission {
  return { ...s, evidence: s.evidence.map((e) => (!e.title && titles.has(e.url) ? { ...e, title: titles.get(e.url) } : e)) };
}

const kindOfGenre = (genre?: string) => (Object.entries(EVIDENCE_KINDS).find(([, label]) => label === genre)?.[0] ?? 'other') as EvidenceKind;

/**
 * Evidence in a signed report that still has the name given when no title is
 * known (e.g. "Pull request #3") and links to GitHub, so a title can be found.
 */
export function untitledReportEvidence(c: OpenBadgeCredential): Pick<Evidence, 'url' | 'kind'>[] {
  return (c.evidence ?? [])
    .filter((e) => e.id && e.genre !== 'Maintainer review' && githubRef(e.id))
    .map((e) => ({ url: e.id!, kind: kindOfGenre(e.genre), name: e.name }))
    .filter((e) => e.name === evidenceTitle({ url: e.url, kind: e.kind }))
    .map(({ url, kind }) => ({ url, kind }));
}

/**
 * A signed report, unsigned, with titles (by link) given to evidence that
 * still has its automatic name; everything else exactly as it was. Undefined
 * if no title applies, so the report need not be signed again.
 */
export function retitledReport(c: OpenBadgeCredential, titles: Map<string, string>): JsonObject | undefined {
  const untitled = new Set(untitledReportEvidence(c).map((e) => e.url));
  if (![...untitled].some((url) => titles.has(url))) return undefined;
  const { proof: _signature, ...body } = c;
  return {
    ...body,
    evidence: (c.evidence ?? []).map((e) => (e.id && untitled.has(e.id) && titles.has(e.id) ? { ...e, name: titles.get(e.id) } : e)),
  } as unknown as JsonObject;
}
