/**
 * W3C Data Integrity proofs using the `eddsa-rdfc-2022` cryptosuite
 * (https://www.w3.org/TR/vc-di-eddsa/), which is the embedded proof format
 * named by Open Badges 3.0 (section 8.3).
 *
 * Works identically in the browser (verification on the site) and in Node
 * (signing in the GitHub signing workflow). JSON-LD contexts are vendored so
 * canonicalization never touches the network.
 */
import jsonld from 'jsonld';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58 } from '@scure/base';

import credentialsV2 from './contexts/credentials-v2.json';
import obV3 from './contexts/ob-v3p0-3.0.3.json';
import multikeyV1 from './contexts/multikey-v1.json';
import didV1 from './contexts/did-v1.json';

const CONTEXTS: Readonly<Record<string, unknown>> = {
  'https://www.w3.org/ns/credentials/v2': credentialsV2,
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json': obV3,
  'https://w3id.org/security/multikey/v1': multikeyV1,
  'https://www.w3.org/ns/did/v1': didV1,
};

/** Only the vendored contexts can be loaded: no remote context can change what is signed. */
export type DocumentLoader = typeof documentLoader;

export async function documentLoader(url: string) {
  const document = CONTEXTS[url];
  if (!document) throw new Error(`Refusing to load unknown JSON-LD context: ${url}`);
  return { contextUrl: null, documentUrl: url, document };
}

export type JsonObject = Record<string, unknown>;

export interface DataIntegrityProof {
  type: 'DataIntegrityProof';
  cryptosuite: 'eddsa-rdfc-2022';
  created: string;
  verificationMethod: string;
  proofPurpose: 'assertionMethod';
  proofValue: string;
}

// --- Multikey encoding (https://www.w3.org/TR/cid-1.0/#Multikey) -------------

const ED25519_PUB_HEADER = [0xed, 0x01];
const ED25519_PRIV_HEADER = [0x80, 0x26];

function withHeader(header: number[], bytes: Uint8Array): string {
  const out = new Uint8Array(header.length + bytes.length);
  out.set(header);
  out.set(bytes, header.length);
  return 'z' + base58.encode(out);
}

function stripHeader(multibase: string, header: number[], expectedLength: number, label: string): Uint8Array {
  if (!multibase.startsWith('z')) throw new Error(`${label} must be base58btc multibase (start with "z")`);
  const bytes = base58.decode(multibase.slice(1));
  if (bytes.length !== header.length + expectedLength || header.some((b, i) => bytes[i] !== b)) {
    throw new Error(`${label} is not an Ed25519 Multikey`);
  }
  return bytes.slice(header.length);
}

export const encodePublicKey = (pub: Uint8Array) => withHeader(ED25519_PUB_HEADER, pub);
export const encodeSecretKey = (seed: Uint8Array) => withHeader(ED25519_PRIV_HEADER, seed);
export const decodePublicKey = (mb: string) => stripHeader(mb, ED25519_PUB_HEADER, 32, 'publicKeyMultibase');
export const decodeSecretKey = (mb: string) => stripHeader(mb, ED25519_PRIV_HEADER, 32, 'secretKeyMultibase');

export interface KeyPair {
  publicKeyMultibase: string;
  secretKeyMultibase: string;
}

export function generateKeyPair(): KeyPair {
  const seed = ed25519.utils.randomSecretKey();
  return {
    publicKeyMultibase: encodePublicKey(ed25519.getPublicKey(seed)),
    secretKeyMultibase: encodeSecretKey(seed),
  };
}

export function publicKeyFor(secretKeyMultibase: string): string {
  return encodePublicKey(ed25519.getPublicKey(decodeSecretKey(secretKeyMultibase)));
}

// --- eddsa-rdfc-2022 -----------------------------------------------------------

async function canonicalHash(doc: JsonObject, loader: DocumentLoader): Promise<Uint8Array> {
  const nquads = (await jsonld.canonize(doc as jsonld.JsonLdDocument, {
    algorithm: 'URDNA2015', // RDFC-1.0
    format: 'application/n-quads',
    documentLoader: loader,
    safe: true, // fail on any term that does not map to an IRI, instead of silently dropping it
  } as unknown as jsonld.Options.Normalize)) as string;
  return sha256(new TextEncoder().encode(nquads));
}

async function hashData(unsecured: JsonObject, proofConfig: JsonObject, loader: DocumentLoader): Promise<Uint8Array> {
  const [proofHash, docHash] = await Promise.all([
    canonicalHash({ ...proofConfig, '@context': unsecured['@context'] }, loader),
    canonicalHash(unsecured, loader),
  ]);
  const out = new Uint8Array(64);
  out.set(proofHash, 0);
  out.set(docHash, 32);
  return out;
}

export async function sign(
  unsecured: JsonObject,
  opts: { secretKeyMultibase: string; verificationMethod: string; created?: string; documentLoader?: DocumentLoader },
): Promise<JsonObject & { proof: DataIntegrityProof }> {
  if ('proof' in unsecured) throw new Error('Document is already signed');
  const proofConfig = {
    type: 'DataIntegrityProof',
    cryptosuite: 'eddsa-rdfc-2022',
    created: opts.created ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), // seconds precision
    verificationMethod: opts.verificationMethod,
    proofPurpose: 'assertionMethod',
  } as const;
  const data = await hashData(unsecured, proofConfig, opts.documentLoader ?? documentLoader);
  const signature = ed25519.sign(data, decodeSecretKey(opts.secretKeyMultibase));
  return { ...unsecured, proof: { ...proofConfig, proofValue: 'z' + base58.encode(signature) } };
}

/**
 * Checks the cryptographic signature only. Whether the verification method is
 * actually authorised by the issuer is decided by the caller (see verify.ts).
 */
export async function verifySignature(
  secured: JsonObject,
  publicKeyMultibase: string,
  loader: DocumentLoader = documentLoader,
): Promise<boolean> {
  const { proof, ...unsecured } = secured as JsonObject & { proof?: DataIntegrityProof };
  if (!proof || Array.isArray(proof)) throw new Error('Expected exactly one proof');
  if (proof.type !== 'DataIntegrityProof' || proof.cryptosuite !== 'eddsa-rdfc-2022') {
    throw new Error(`Unsupported proof: ${proof.type} / ${proof.cryptosuite}`);
  }
  if (proof.proofPurpose !== 'assertionMethod') throw new Error('Proof purpose must be assertionMethod');
  if (typeof proof.proofValue !== 'string' || !proof.proofValue.startsWith('z')) {
    throw new Error('proofValue must be base58btc multibase');
  }
  const { proofValue, ...proofConfig } = proof;
  const data = await hashData(unsecured, proofConfig, loader);
  return ed25519.verify(base58.decode(proofValue.slice(1)), data, decodePublicKey(publicKeyMultibase));
}
