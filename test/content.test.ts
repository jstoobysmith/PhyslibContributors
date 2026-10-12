import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { CONTENT_FILES, fillPlaceholders, missingHeader, parseContentFile, PLACEHOLDERS, unknownPlaceholders } from '../src/lib/content';

const dir = new URL('../content/', import.meta.url);
const read = (f: string) => readFileSync(new URL(`${f}.md`, dir), 'utf8');

describe('page text in content/', () => {
  it('has every file the site shows, using only known placeholders', () => {
    for (const f of CONTENT_FILES) {
      expect(existsSync(new URL(`${f}.md`, dir)), `content/${f}.md`).toBe(true);
      expect(unknownPlaceholders(f, read(f)), `content/${f}.md`).toEqual([]);
      expect(missingHeader(read(f)), `content/${f}.md header`).toEqual([]);
    }
  });

  it('has no files the site does not show', () => {
    const files = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => f.replace(/\.md$/, ''));
    expect(files.sort()).toEqual([...CONTENT_FILES].sort());
  });

  it('reads the header apart from the text', () => {
    const file = '---\nwhere: >\n  Home page,\n  at the top.\npurpose: Says hello.\n---\n\nHello **there**.\n';
    expect(parseContentFile(file)).toEqual({ where: 'Home page, at the top.', purpose: 'Says hello.', body: '\nHello **there**.\n' });
    expect(parseContentFile('No header.')).toEqual({ body: 'No header.' });
    expect(missingHeader('---\nwhere: Somewhere\n---\nText')).toEqual(['purpose']);
  });

  it('fills in placeholders, and leaves unknown ones visible', () => {
    expect(fillPlaceholders('{siteTitle} and {nope}', PLACEHOLDERS)).toBe(`${PLACEHOLDERS.siteTitle} and {nope}`);
    expect(unknownPlaceholders('report/certifies', '{sectionPhrase} {siteTitle} {aprovals}')).toEqual(['aprovals']);
  });
});
