import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../scripts/setup-check/', import.meta.url);
const partFiles = readdirSync(dir).filter((f) => /^\d+-.*\.ts$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));

describe('setup check', () => {
  it('numbers each check after the file it is in, in order', () => {
    expect(partFiles.map((f) => parseInt(f))).toEqual(partFiles.map((_, i) => i + 1));
    for (const file of partFiles) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      const n = parseInt(file);
      expect(source, file).toContain(`number: ${n},`);
      const ids = [...source.matchAll(/check\('(\d+)\.(\d+)'/g)].map((m) => [Number(m[1]), Number(m[2])]);
      expect(ids.length, file).toBeGreaterThan(0);
      expect(ids, file).toEqual(ids.map((_, i) => [n, i + 1]));
    }
  });

  it('runs every part', () => {
    const index = readFileSync(new URL('index.ts', dir), 'utf8');
    for (const file of partFiles) expect(index).toContain(`from './${file.replace(/\.ts$/, '')}'`);
  });
});
