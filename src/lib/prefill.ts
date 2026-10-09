/**
 * Links that fill in the submission form, e.g.
 *
 *   /submit?section=review&name=Ada%20Example&github=ada&title=…&prs=412,418
 *
 * so a maintainer can send someone a form that is ready to check and send.
 * Everything is read in the browser; nothing is sent anywhere by opening one.
 *
 *   section    a section id (review, maintenance, …)
 *   name       the contributor's full name
 *   github     their GitHub username ("@name" and profile links work too)
 *   orcid      their ORCID iD
 *   title, summary
 *   from, to   months, YYYY-MM
 *   prs        Physlib pull request numbers, separated by commas
 *   link       any other evidence link (may be repeated)
 */
import { SECTION_IDS, SITE, type SectionId } from './config';
import { githubLoginFromInput, parsePullRequestList, pullRequestUrl } from './submission';

/** The parameters a link can use, in the order they are written, as documented on the About page. */
export const PREFILL_PARAMETERS: { name: string; fills: string; example: string }[] = [
  { name: 'section', fills: 'The section, by its id: ' + SECTION_IDS.join(', ') + '.', example: 'review' },
  { name: 'name', fills: 'The contributor’s full name.', example: 'Ada Example' },
  { name: 'github', fills: 'The contributor’s GitHub username.', example: 'ada-example' },
  { name: 'orcid', fills: 'The contributor’s ORCID iD.', example: '0000-0002-1825-0097' },
  { name: 'title', fills: 'The title of the report.', example: 'Reviewed 10 pull requests on quantum mechanics' },
  { name: 'summary', fills: 'The summary. %0A starts a new line.', example: 'Careful reviews of …' },
  { name: 'from, to', fills: 'The months the work covers, as YYYY-MM.', example: '2026-07' },
  { name: 'prs', fills: 'Physlib pull requests, by number, separated by commas. Their titles are added automatically.', example: '1351,1348,1328' },
  { name: 'link', fills: 'Any other evidence link, in full. Repeat it for several.', example: 'https://leanprover.zulipchat.com/…' },
];

export interface Prefill {
  section?: SectionId;
  name?: string;
  github?: string;
  orcid?: string;
  title?: string;
  summary?: string;
  from?: string;
  to?: string;
  prs?: number[];
  links?: string[];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;


/** The fields a link fills in, or undefined if it fills in none (a bare ?section= only chooses the section). */
export function readPrefill(params: URLSearchParams): Prefill | undefined {
  const text = (key: string) => params.get(key)?.trim() || undefined;
  const section = SECTION_IDS.find((id) => id === params.get('section'));
  const prs = parsePullRequestList(params.get('prs') ?? '', SITE.physlib.repository).numbers;
  const links = params.getAll('link').map((l) => l.trim()).filter((l) => /^https:\/\/\S+$/.test(l));
  const prefill: Prefill = {
    name: text('name'),
    github: text('github') && githubLoginFromInput(text('github')!),
    orcid: text('orcid'),
    title: text('title'),
    summary: params.get('summary')?.replace(/\r\n/g, '\n').trim() || undefined,
    from: MONTH.test(params.get('from') ?? '') ? params.get('from')! : undefined,
    to: MONTH.test(params.get('to') ?? '') ? params.get('to')! : undefined,
    prs: prs.length ? prs : undefined,
    links: links.length ? links : undefined,
  };
  const filled = Object.values(prefill).some((v) => v !== undefined);
  return filled ? { section, ...prefill } : undefined;
}

/** The query string of a link that fills in the form with these fields. */
export function prefillParams(p: Prefill): URLSearchParams {
  const params = new URLSearchParams();
  const put = (key: string, value?: string) => value?.trim() && params.set(key, value.trim());
  put('section', p.section);
  put('name', p.name);
  put('github', p.github);
  put('orcid', p.orcid);
  put('title', p.title);
  put('summary', p.summary);
  put('from', p.from);
  put('to', p.to);
  if (p.prs?.length) params.set('prs', p.prs.join(','));
  for (const l of p.links ?? []) params.append('link', l);
  return params;
}

/** Splits evidence links into Physlib pull request numbers (written compactly as prs=) and other links. */
export function splitEvidenceLinks(urls: string[]): Pick<Prefill, 'prs' | 'links'> {
  const prs: number[] = [];
  const links: string[] = [];
  for (const url of urls.filter(Boolean)) {
    const n = parsePullRequestList(url, SITE.physlib.repository).numbers[0];
    if (n && pullRequestUrl(SITE.physlib.repository, n) === url.replace(/\/$/, '')) prs.push(n);
    else links.push(url);
  }
  return { prs: prs.length ? prs : undefined, links: links.length ? links : undefined };
}

