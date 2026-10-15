/**
 * The main blocks of page text, kept as Markdown in content/ so they can be
 * edited without touching code (see content/README.md). Shared by the site,
 * which renders them, and by the tests and setup check, which make sure every
 * file exists and uses only known placeholders.
 */
import { SITE, urls } from './config';

/** Every file of content/ the site shows, without ".md". */
export const CONTENT_FILES = [
  'top-strip',
  'footer',
  'footer-beta',
  'home/intro',
  'home/new-to-physlib',
  'home/new-to-physlib-note',
  'about/purpose',
  'about/maintainers',
  'about/approval-notes',
  'about/process',
  'about/numbering',
  'about/meaning',
  'about/revocation',
  'submit/intro',
  'submit/prefilled-notice',
  'submit/test-notice',
  'submit/what-happens-next',
  'submit/what-happens-next-note',
  'submit/share-link',
  'verify/intro',
  'report/certifies',
  'report/certifies-test',
] as const;

export type ContentFile = (typeof CONTENT_FILES)[number];

/** The values {name} placeholders stand for, from config/. */
export const PLACEHOLDERS = {
  siteTitle: SITE.title,
  reportSeries: SITE.reportSeries,
  issuerName: SITE.issuer.name,
  repository: urls.repo(),
  physlibSite: SITE.physlib.site,
  physlibZulip: SITE.physlib.zulip,
  physlibGettingStarted: SITE.physlib.gettingStarted,
  goodFirstIssues: urls.goodFirstIssues(),
} satisfies Record<string, string>;

/** Placeholders that only some files have, with values given where the file is shown. */
export const LOCAL_PLACEHOLDERS: Partial<Record<ContentFile, string[]>> = {
  'report/certifies': ['sectionPhrase'],
};

/**
 * A content file: a short header saying where its text appears and what it
 * should say (for whoever edits it), then the text itself, in Markdown:
 *
 *   ---
 *   where: >
 *     Home page: the paragraph at the top, …
 *   purpose: >
 *     Introduces the site to a first-time visitor: …
 *   ---
 *
 *   The text …
 */
export interface ContentText {
  where?: string;
  purpose?: string;
  /** The text shown on the site. */
  body: string;
}

/** Splits a content file into its header and its text. The header's values may be on one line or indented below "key: >". */
export function parseContentFile(text: string): ContentText {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { body: text };
  const fields: Record<string, string> = {};
  let key: string | undefined;
  for (const line of m[1].split('\n')) {
    const top = line.match(/^(\w+):\s*(.*)$/);
    if (top) {
      key = top[1];
      fields[key] = /^[>|]-?$/.test(top[2]) ? '' : top[2].replace(/^(["'])(.*)\1$/, '$2');
    } else if (key && /^\s+\S/.test(line)) fields[key] = `${fields[key]} ${line.trim()}`.trim();
  }
  return { where: fields.where, purpose: fields.purpose, body: text.slice(m[0].length) };
}

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/** The text with each {name} replaced by its value; unknown names are left as they are. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => (name in values ? values[name] : whole));
}

/** The {names} in a file's text (not its header) that have no value. */
export function unknownPlaceholders(file: ContentFile, text: string): string[] {
  const known = new Set([...Object.keys(PLACEHOLDERS), ...(LOCAL_PLACEHOLDERS[file] ?? [])]);
  const { body } = parseContentFile(text);
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]))].filter((name) => !known.has(name));
}

/** What is missing from a file's header: where its text appears, and what it should say. */
export function missingHeader(text: string): string[] {
  const { where, purpose } = parseContentFile(text);
  return [!where && 'where', !purpose && 'purpose'].filter((k): k is string => !!k);
}
