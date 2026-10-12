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

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/** The text with each {name} replaced by its value; unknown names are left as they are. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => (name in values ? values[name] : whole));
}

/** The {names} in a file's text that have no value. */
export function unknownPlaceholders(file: ContentFile, text: string): string[] {
  const known = new Set([...Object.keys(PLACEHOLDERS), ...(LOCAL_PLACEHOLDERS[file] ?? [])]);
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))].filter((name) => !known.has(name));
}
