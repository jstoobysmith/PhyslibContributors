/**
 * What the setup check knows about where it runs: the repository, the secrets
 * of the "signing" environment (only inside the Setup check workflow, or with
 * --key locally) and access to the GitHub API.
 */
import { readFileSync } from 'node:fs';
import { SITE } from '../../src/lib/config';
import { option } from '../lib/args';
import { skip } from './checks';

const args = process.argv.slice(2);

export const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
export const REPO = process.env.GITHUB_REPOSITORY ?? `${SITE.repository.owner}/${SITE.repository.name}`;
export const TOKEN = process.env.GITHUB_TOKEN || undefined;

const keyFile = option(args, '--key');
export const SECRETS = {
  /** The OB_SIGNING_KEY secret (or a local key file given with --key). */
  signingKey: keyFile ? readFileSync(keyFile, 'utf8') : process.env.OB_SIGNING_KEY || undefined,
  /** The SIGNING_DEPLOY_KEY secret. */
  deployKey: process.env.SIGNING_DEPLOY_KEY || undefined,
};

/** The verdict for a secret that is not available outside the workflow. */
export const secretNotHere = (name: string) =>
  skip(`The ${name} secret is only available in the Setup check workflow on GitHub (Actions → Setup check → Run workflow).`);

/** A GitHub API call that reports the HTTP status instead of throwing. */
export async function github<T>(path: string): Promise<{ status: number; data?: T }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  return { status: res.status, data: res.ok ? ((await res.json()) as T) : undefined };
}

/** Fetches a page or file of the live site. */
export async function fetchUrl(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'Cache-Control': 'no-cache' } });
  return { status: res.status, text: await res.text() };
}
