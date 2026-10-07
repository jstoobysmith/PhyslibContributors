import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DataIntegrityProof } from '@digitalbazaar/data-integrity';
import { cryptosuite as eddsaRdfc2022 } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite';
import * as Ed25519Multikey from '@digitalbazaar/ed25519-multikey';
import jsigs from 'jsonld-signatures';

import { documentLoader, generateKeyPair, publicKeyFor, sign, verifySignature } from '../src/lib/dataIntegrity';
import { buildCredential } from '../src/lib/credential';
import { ISSUER_DID, verificationMethodId } from '../src/lib/config';
import { exampleRecord as record, exampleSubmission } from './fixtures/example';

const fixture = (p: string) => JSON.parse(readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8'));


describe('eddsa-rdfc-2022', () => {
  it('verifies the W3C vc-di-eddsa test vector', async () => {
    // The test vector uses the W3C examples context, which the site itself never loads.
    const examples = fixture('w3c/examples-v2.json');
    const loader = async (url: string) =>
      url === 'https://www.w3.org/ns/credentials/examples/v2' ? { contextUrl: null, documentUrl: url, document: examples } : documentLoader(url);
    const signed = fixture('w3c/signedDataInt.json');
    const { publicKeyMultibase, privateKeyMultibase } = fixture('w3c/keyPair.json');
    expect(await verifySignature(signed, publicKeyMultibase, loader)).toBe(true);

    // And reproduces the exact signature (Ed25519 is deterministic).
    const { proof, ...unsigned } = signed;
    const resigned = await sign(unsigned, {
      secretKeyMultibase: privateKeyMultibase,
      verificationMethod: proof.verificationMethod,
      created: proof.created,
      documentLoader: loader,
    });
    expect(resigned.proof.proofValue).toBe(proof.proofValue);
    expect(publicKeyFor(privateKeyMultibase)).toBe(publicKeyMultibase);
  });

  it('signs and verifies an Open Badges 3.0 credential, and detects tampering', async () => {
    const keys = generateKeyPair();
    const vc = buildCredential('example', exampleSubmission, record);
    const signed = await sign(vc, { secretKeyMultibase: keys.secretKeyMultibase, verificationMethod: verificationMethodId('key-1') });
    expect(await verifySignature(signed, keys.publicKeyMultibase)).toBe(true);

    const tampered = structuredClone(signed) as typeof signed & { credentialSubject: { narrative: string } };
    tampered.credentialSubject.narrative += ' (and also proved the Riemann hypothesis)';
    expect(await verifySignature(tampered, keys.publicKeyMultibase)).toBe(false);

    expect(await verifySignature(signed, generateKeyPair().publicKeyMultibase)).toBe(false);
  });

  describe('interoperates with the Digital Bazaar reference implementation', () => {
    const keys = generateKeyPair();
    const vmId = verificationMethodId('key-1');
    const controller = {
      '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/multikey/v1'],
      id: ISSUER_DID,
      verificationMethod: [{ id: vmId, type: 'Multikey', controller: ISSUER_DID, publicKeyMultibase: keys.publicKeyMultibase }],
      assertionMethod: [vmId],
    };
    const loader = async (url: string) => {
      if (url === ISSUER_DID) return { contextUrl: null, documentUrl: url, document: controller };
      if (url === vmId) {
        return {
          contextUrl: null,
          documentUrl: url,
          document: { '@context': 'https://w3id.org/security/multikey/v1', ...controller.verificationMethod[0] },
        };
      }
      return documentLoader(url);
    };
    const purpose = () => new jsigs.purposes.AssertionProofPurpose({ controller });

    it('our signatures verify with their library', async () => {
      const signed = await sign(buildCredential('example', exampleSubmission, record), {
        secretKeyMultibase: keys.secretKeyMultibase,
        verificationMethod: vmId,
      });
      const suite = new DataIntegrityProof({ cryptosuite: eddsaRdfc2022 });
      const result = await jsigs.verify(signed, { suite, purpose: purpose(), documentLoader: loader });
      expect(result.error ?? null).toBeNull();
      expect(result.verified).toBe(true);
    });

    it('their signatures verify with our library', async () => {
      const keyPair = await Ed25519Multikey.from({
        id: vmId,
        controller: ISSUER_DID,
        publicKeyMultibase: keys.publicKeyMultibase,
        secretKeyMultibase: keys.secretKeyMultibase,
      });
      const suite = new DataIntegrityProof({ signer: keyPair.signer(), cryptosuite: eddsaRdfc2022 });
      const signed = await jsigs.sign(buildCredential('example', exampleSubmission, record), {
        suite,
        purpose: purpose(),
        documentLoader: loader,
      });
      expect(await verifySignature(signed, keys.publicKeyMultibase)).toBe(true);
    });
  });
});
