import { describe, expect, it } from 'vitest';
import { credentialFile, didWebBaseUrl, didWebDocumentUrl, didWebFromUrl, ALL_SECTIONS, EVIDENCE_KINDS, SECTION_IDS, SECTIONS, TEST_SECTION } from '../src/lib/config';

describe('config', () => {
  it('defines exactly the sections the code knows about', () => {
    expect(ALL_SECTIONS.map((s) => s.id)).toEqual([...SECTION_IDS]);
    // One test section, kept out of the sections listed on the site.
    expect(TEST_SECTION?.id).toBe('test');
    expect(SECTIONS.map((s) => s.id)).not.toContain('test');
    for (const s of ALL_SECTIONS) {
      expect(s.criteria.length).toBeGreaterThan(0);
      for (const k of s.evidenceKinds) expect(Object.keys(EVIDENCE_KINDS)).toContain(k);
    }
  });

  it('maps site URLs to did:web and back', () => {
    expect(didWebFromUrl('https://example.org')).toBe('did:web:example.org');
    expect(didWebFromUrl('https://example.org/a/b')).toBe('did:web:example.org:a:b');
    expect(didWebDocumentUrl('did:web:example.org')).toBe('https://example.org/.well-known/did.json');
    expect(didWebBaseUrl('did:web:example.org:a:b')).toBe('https://example.org/a/b');
    expect(didWebBaseUrl('did:web:example.org')).toBe('https://example.org');
  });

  it('keeps the specimen apart from real reports', () => {
    expect(credentialFile('specimen')).toBe('specimen.json');
    expect(credentialFile('x')).toBe('credentials/x.json');
  });
});
