/**
 * Generates a new Ed25519 signing key for Physlib Contributions.
 *
 *   npm run keygen                      # temporary key (default)
 *   npm run keygen -- --status active   # the long-term key, once the physlib.io DNS is ready
 *
 * The public key is added to config/keys.json (and from there to the DID
 * document); earlier keys are marked "retired" so awards they signed still
 * verify. The secret key is written to .keys/<id>.json (git-ignored, mode 600):
 * store it as the OB_SIGNING_KEY secret of the "signing" environment, then delete it.
 */
import { join } from 'node:path';
import { generateKeyPair } from '../src/lib/dataIntegrity';
import { ISSUER_DID, SITE, verificationMethodId, type KeyConfig, type KeyStatus } from '../src/lib/config';
import { dnsRecordFor } from '../src/lib/verify';
import { ROOT, readJson, writeJson } from './lib/files';
import { option } from './lib/args';

const args = process.argv.slice(2);
const status = (option(args, '--status') ?? 'temporary') as KeyStatus;
if (status !== 'temporary' && status !== 'active') throw new Error('--status must be "temporary" or "active"');

const keysPath = join(ROOT, 'config', 'keys.json');
const existing = readJson<KeyConfig[]>(keysPath);
const n = existing.reduce((max, k) => Math.max(max, Number(k.id.replace(/\D/g, '')) || 0), 0) + 1;
const id = `key-${n}`;

const keys = generateKeyPair();
writeJson(keysPath, [
  ...existing.map((k): KeyConfig => (k.status === 'revoked' ? k : { ...k, status: 'retired' })),
  { id, publicKeyMultibase: keys.publicKeyMultibase, status },
]);

const secretPath = join(ROOT, '.keys', `${id}.json`);
writeJson(
  secretPath,
  { verificationMethod: verificationMethodId(id), publicKeyMultibase: keys.publicKeyMultibase, secretKeyMultibase: keys.secretKeyMultibase },
  0o600,
);

console.log(`
Generated ${status} signing key ${id}
  verification method  ${verificationMethodId(id)}
  public key           ${keys.publicKeyMultibase}
  secret key file      ${secretPath}   (git-ignored, never commit it)

Next steps
  1. Store the secret in the "signing" environment of the repository:
       gh secret set OB_SIGNING_KEY --env signing --repo ${SITE.repository.owner}/${SITE.repository.name} < ${secretPath.slice(ROOT.length + 1)}
  2. Commit config/keys.json so the public key is published in the DID document.
  3. When ready, add this TXT record to the DNS zone:
       ${SITE.dns.txtName}  TXT  "${dnsRecordFor(ISSUER_DID, keys.publicKeyMultibase)}"
  4. Re-sign existing awards with the new key: run the "Sign and deploy" workflow
     manually with "Re-sign every award" ticked.
`);
