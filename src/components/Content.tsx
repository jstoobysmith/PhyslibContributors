import { marked } from 'marked';
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fillPlaceholders, parseContentFile, PLACEHOLDERS, type ContentFile } from '../lib/content';

/** The Markdown files of content/, built into the site. */
const FILES = import.meta.glob('/content/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const BASE = import.meta.env.BASE_URL;

/** A content file as HTML, with its placeholders filled in and links to this site's pages under the site's base path. */
export function contentHtml(file: ContentFile, values: Record<string, string> = {}, inline = false): string {
  // Only the text: the header (where it appears, what it should say) is for whoever edits the file.
  const text = fillPlaceholders(parseContentFile(FILES[`/content/${file}.md`] ?? '').body, { ...PLACEHOLDERS, ...values }).trim();
  const html = (inline ? marked.parseInline(text, { async: false }) : marked.parse(text, { async: false })) as string;
  return html.replace(/href="\/(?!\/)/g, `href="${BASE}`);
}

/**
 * A block of page text from content/ (see content/README.md). Links to this
 * site's own pages open without reloading, like the site's other links.
 */
export function Content({
  file,
  values,
  inline,
  className = '',
}: {
  file: ContentFile;
  /** Values for placeholders that only this file has. */
  values?: Record<string, string>;
  /** Text inside a line (no paragraph of its own). */
  inline?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const onClick = (e: MouseEvent<HTMLElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (!a || !href?.startsWith(BASE) || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(`/${href.slice(BASE.length)}`);
  };
  const html = { __html: contentHtml(file, values, inline) };
  return inline ? (
    <span className={className} onClick={onClick} dangerouslySetInnerHTML={html} />
  ) : (
    <div className={`content ${className}`} onClick={onClick} dangerouslySetInnerHTML={html} />
  );
}
