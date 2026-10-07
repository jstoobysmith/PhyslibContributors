/**
 * Part 3: the signing keys. The public keys in config/keys.json, the secret
 * key in the OB_SIGNING_KEY secret, whether the two belong together, and the
 * DNS record that will vouch for the key.
 */
import { canSign, ISSUER_DID, KEYS, SIGNING_KEY, SITE, verificationMethodId } from '../../src/lib/config';
import { decodePublicKey, publicKeyFor, sign, verifySignature } from '../../src/lib/dataIntegrity';
import { checkDnsAnchor, dnsRecordFor } from '../../src/lib/verify';
import { definePart, fail, listing, pass, warn } from './checks';
import { IN_ACTIONS, SECRETS, secretNotHere } from './context';

const KEYGEN_FIX = 'README: Keys, DID and the physlib.io DNS';

export default definePart({
  number: 3,
  title: 'Signing keys',
  covers: 'config/keys.json, the OB_SIGNING_KEY secret, and the DNS record for the key.',
  file: import.meta.url,
  async run(check) {
    await check('3.1', 'Public keys', () => {
      const problems: string[] = [];
      const ids = KEYS.map((k) => k.id);
      if (new Set(ids).size !== ids.length) problems.push('two keys share an id');
      for (const k of KEYS) {
        try {
          decodePublicKey(k.publicKeyMultibase);
        } catch {
          problems.push(`${k.id} is not an Ed25519 public key`);
        }
        if (!['active', 'temporary', 'retired', 'revoked'].includes(k.status)) problems.push(`${k.id} has an unknown status "${k.status}"`);
      }
      if (KEYS.length === 0) problems.push('there are no keys');
      return problems.length
        ? fail(`config/keys.json: ${problems.join('; ')}.`, `Generate keys with npm run keygen (${KEYGEN_FIX}).`)
        : pass(`${listing(KEYS.map((k) => `${k.id} (${k.status})`))}.`);
    });

    await check('3.2', 'Key that signs new reports', () => {
      const signers = KEYS.filter((k) => canSign(k.status));
      if (!SIGNING_KEY) return fail('No key in config/keys.json is active or temporary, so nothing can be signed.', `Run npm run keygen (${KEYGEN_FIX}).`);
      if (signers.length > 1) {
        return warn(`${listing(signers.map((k) => k.id))} can all sign; ${SIGNING_KEY.id} (the newest) is used.`, 'Mark the older keys "retired" in config/keys.json.');
      }
      if (SIGNING_KEY.status === 'temporary') {
        return warn(`${SIGNING_KEY.id} is a temporary key.`, `Before launch, replace it with a permanent key: npm run keygen -- --status active (${KEYGEN_FIX}).`);
      }
      return pass(`${SIGNING_KEY.id} (${verificationMethodId(SIGNING_KEY.id)}).`);
    });

    let secretKeyMultibase: string | undefined;
    await check('3.3', 'Secret key (OB_SIGNING_KEY)', () => {
      if (!SECRETS.signingKey) {
        if (!IN_ACTIONS) return secretNotHere('OB_SIGNING_KEY');
        return fail(
          'The "signing" environment has no OB_SIGNING_KEY secret, so merged submissions stay unsigned.',
          'gh secret set OB_SIGNING_KEY --env signing < .keys/key-N.json (README: Setting up the repository, step 3).',
        );
      }
      let publicKey: string;
      try {
        secretKeyMultibase = (JSON.parse(SECRETS.signingKey) as { secretKeyMultibase: string }).secretKeyMultibase;
        publicKey = publicKeyFor(secretKeyMultibase);
      } catch {
        secretKeyMultibase = undefined;
        // Never print any part of the secret.
        return fail('OB_SIGNING_KEY is not a key file written by npm run keygen.', 'Store the whole .keys/key-N.json file as the secret.');
      }
      const key = KEYS.find((k) => k.publicKeyMultibase === publicKey);
      if (!key) {
        secretKeyMultibase = undefined;
        return fail('OB_SIGNING_KEY does not match any public key in config/keys.json.', 'Store the secret key that belongs to the active key, or commit the config/keys.json that npm run keygen wrote.');
      }
      if (!canSign(key.status)) {
        return fail(`OB_SIGNING_KEY is ${key.id}, which is ${key.status} and may not sign.`, `Store the secret of ${SIGNING_KEY?.id ?? 'the active key'} instead.`);
      }
      if (key.id !== SIGNING_KEY?.id) {
        return warn(`OB_SIGNING_KEY is ${key.id}, but the newest signing key is ${SIGNING_KEY?.id}.`, `Store the secret of ${SIGNING_KEY?.id}.`);
      }
      return pass(`The secret is the private half of ${key.id} in config/keys.json.`);
    });

    await check('3.4', 'Signing with the secret key', async () => {
      if (!secretKeyMultibase || !SIGNING_KEY) return SECRETS.signingKey || IN_ACTIONS ? fail('Skipped, because 3.3 failed.') : secretNotHere('OB_SIGNING_KEY');
      const doc = { '@context': ['https://www.w3.org/ns/credentials/v2'], type: ['VerifiableCredential'], issuer: ISSUER_DID, credentialSubject: { id: 'urn:setup-check' } };
      const signed = await sign(doc, { secretKeyMultibase, verificationMethod: verificationMethodId(SIGNING_KEY.id) });
      return (await verifySignature(signed, SIGNING_KEY.publicKeyMultibase))
        ? pass(`A test document signed with the secret verifies with ${SIGNING_KEY.id}'s public key.`)
        : fail('A test document signed with the secret does not verify with the public key.', 'Store the secret key that belongs to the active key.');
    });

    await check('3.5', `DNS record (${SITE.dns.txtName})`, async () => {
      if (!SIGNING_KEY) return fail('There is no signing key to look up.');
      const record = dnsRecordFor(ISSUER_DID, SIGNING_KEY.publicKeyMultibase);
      const dns = await checkDnsAnchor(SIGNING_KEY.publicKeyMultibase);
      switch (dns.status) {
        case 'match':
          return pass(`The TXT record names ${SIGNING_KEY.id}.`);
        case 'mismatch':
          return fail(`The TXT record names a different key, so verifiers will flag every report.`, `Change the record to: ${record}`);
        case 'absent':
          return warn(
            `No TXT record yet${SIGNING_KEY.status === 'temporary' ? ' (expected while the key is temporary)' : ''}.`,
            `With the permanent key, add this TXT record at ${SITE.dns.txtName}: ${record}`,
          );
        case 'error':
          return warn(`The DNS lookup did not complete (${dns.message}).`, 'Run the check again later.');
      }
    });
  },
});
