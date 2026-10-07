import { useEffect, useState } from 'react';
import { credentialFile, ISSUER_DID, type Revocation } from '../lib/config';
import { fetchUnderReview } from './github';
import type { OpenBadgeCredential } from '../lib/credential';
import type { JsonObject } from '../lib/dataIntegrity';
import type { ReportsIndex } from '../lib/reports';
import { resolveDidWeb, verifyCredential, type VerificationResult } from '../lib/verify';

/** Path of a file published by this site, respecting the deploy base path. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

const cache = new Map<string, Promise<unknown>>();

export function fetchJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export type Loadable<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T };

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fn().then(
      (data) => live && setState({ status: 'ready', data }),
      (e: Error) => live && setState({ status: 'error', error: e.message }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const useReports = () => useAsync(() => fetchJson<ReportsIndex>(asset('data/reports.json')), []);

export const credentialPath = (slug: string) => asset(credentialFile(slug));

export const useCredential = (slug: string) => useAsync(() => fetchJson<OpenBadgeCredential>(credentialPath(slug)), [slug]);

/**
 * Verifies a credential in the browser. Our own issuer DID document is
 * read from this site, which is where did:web resolves to once deployed;
 * any other issuer is resolved over the network.
 */
export async function verifyInBrowser(credential: JsonObject): Promise<VerificationResult> {
  const revocations = await fetchJson<Revocation[]>(asset('revocations.json')).catch((): Revocation[] => []);
  return verifyCredential(credential, {
    resolveDid: (did) => (did === ISSUER_DID ? fetchJson(asset('did.json')) : resolveDidWeb(did)),
    revoked: revocations.map((r) => r.id),
    trustedIssuers: [ISSUER_DID],
  });
}

export const useUnderReview = () => useAsync(fetchUnderReview, []);

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
}

/** Saves text as a file in the browser. */
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
