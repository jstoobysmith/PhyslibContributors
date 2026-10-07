/**
 * Checks an award from the command line.
 *
 *   npm run verify -- public/credentials/<slug>.json --local   # against this checkout's DID document
 *   npm run verify -- https://…/credentials/<slug>.json        # resolves the issuer's did:web online
 *
 * Only credentials issued by this site's issuer count as genuine.
 */
import { join } from 'node:path';
import { ISSUER_DID, SITE_URL, type Revocation } from '../src/lib/config';
import type { JsonObject } from '../src/lib/dataIntegrity';
import { checkDnsAnchor, dnsCheck, verifyCredential, type Check } from '../src/lib/verify';
import { readJson, ROOT } from './lib/files';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const local = args.includes('--local');
if (!target) {
  console.error('usage: npm run verify -- <file-or-url> [--local]');
  process.exit(2);
}

const credential = (/^https?:/.test(target) ? await (await fetch(target)).json() : readJson(target)) as JsonObject;

const revocations = (
  local
    ? readJson(join(ROOT, 'config', 'revocations.json'))
    : await fetch(`${SITE_URL}/revocations.json`).then((r) => (r.ok ? r.json() : []), () => [])
) as Revocation[];

const result = await verifyCredential(credential, {
  resolveDid: local ? async () => readJson(join(ROOT, 'public', 'did.json')) : undefined,
  revoked: revocations.map((r) => r.id),
  trustedIssuers: [ISSUER_DID],
});

const icon: Record<Check['status'], string> = { pass: '✓', fail: '✗', warn: '!', info: '·' };
const checks = [...result.checks];
if (result.publicKeyMultibase) checks.push(dnsCheck(await checkDnsAnchor(result.publicKeyMultibase)));
for (const c of checks) console.log(`${icon[c.status]} ${c.label}: ${c.detail}`);
const valid = result.valid && checks.every((c) => c.status !== 'fail');
console.log(valid ? '\nGENUINE' : '\nNOT VERIFIED');
process.exit(valid ? 0 : 1);
