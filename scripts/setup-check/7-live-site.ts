/**
 * Part 7: what the public sees. The site is up, publishes the DID document
 * with the right keys (and the private key matches the public key it shows),
 * publishes the revocation list, lists the reports, and its
 * reports verify online exactly as a verifier elsewhere would check them.
 */
import { didWebDocumentUrl, issuerDidDocument, ISSUER_DID, isTestSection, SITE_URL, SPECIMEN_SLUG, urls, type Revocation } from '../../src/lib/config';
import { publicKeyFor, type JsonObject } from '../../src/lib/dataIntegrity';
import { sectionIdOf } from '../../src/lib/credential';
import type { ReportsIndex } from '../../src/lib/reports';
import { verifyCredential } from '../../src/lib/verify';
import { listCredentials, readJson, ROOT } from '../lib/files';
import { join } from 'node:path';
import { definePart, fail, listing, pass, plural, warn } from './checks';
import { fetchUrl, IN_ACTIONS, SECRETS, secretNotHere } from './context';

const DEPLOY_FIX = 'Wait for “Sign and deploy” to finish, or run it from the Actions tab.';

async function json<T>(url: string): Promise<T | undefined> {
  const { status, text } = await fetchUrl(url);
  return status === 200 ? (JSON.parse(text) as T) : undefined;
}

export default definePart({
  number: 7,
  title: 'Live site',
  covers: `What the public sees at ${SITE_URL}.`,
  file: import.meta.url,
  async run(check) {
    await check('7.1', 'Home page', async () => {
      const { status, text } = await fetchUrl(`${SITE_URL}/`);
      if (status !== 200) return fail(`${SITE_URL}/ answers HTTP ${status}.`, 'Check GitHub Pages (4.1) and the last “Sign and deploy” run (4.7).');
      return text.includes('<div id="root">') ? pass(`${SITE_URL}/ is up.`) : warn(`${SITE_URL}/ answers, but not with this site.`, 'Check the Pages settings and siteUrl.');
    });

    let liveRevocations: Revocation[] = [];
    let liveDid: ReturnType<typeof issuerDidDocument> | undefined;
    await check('7.2', 'DID document (the public keys)', async () => {
      const url = didWebDocumentUrl(ISSUER_DID);
      const doc = (liveDid = await json<ReturnType<typeof issuerDidDocument>>(url));
      if (!doc) return fail(`${url} is not published, so no report can be verified.`, DEPLOY_FIX);
      const expected = issuerDidDocument();
      const keysOf = (d: typeof doc) => d.verificationMethod.map((v) => `${v.id.split('#')[1]}=${v.publicKeyMultibase}`).sort().join();
      if (doc.id !== ISSUER_DID) return fail(`${url} is for ${doc.id}, not ${ISSUER_DID}.`, DEPLOY_FIX);
      if (keysOf(doc) !== keysOf(expected)) return fail(`${url} lists different keys from config/keys.json.`, DEPLOY_FIX);
      return pass(`${url} lists ${plural(expected.verificationMethod.length, 'key')}, as in config/keys.json.`);
    });

    await check('7.3', 'Public key on the site matches the private key', async () => {
      if (!SECRETS.signingKey) return IN_ACTIONS ? fail('There is no OB_SIGNING_KEY secret to compare with (see 3.3).') : secretNotHere('OB_SIGNING_KEY');
      let publicKey: string;
      try {
        publicKey = publicKeyFor((JSON.parse(SECRETS.signingKey) as { secretKeyMultibase: string }).secretKeyMultibase);
      } catch {
        return fail('OB_SIGNING_KEY is not a key file written by npm run keygen (see 3.3).');
      }
      if (!liveDid) return fail('The DID document is not published (see 7.2).', DEPLOY_FIX);
      // What verifiers use: the DID document's keys that may sign (assertionMethod).
      const method = liveDid.verificationMethod.find((v) => v.publicKeyMultibase === publicKey);
      if (!method || !liveDid.assertionMethod.includes(method.id)) {
        return fail(
          `The private key's public half is not in ${didWebDocumentUrl(ISSUER_DID)}, so reports signed now would not verify.`,
          'Store the secret of the active key in config/keys.json as OB_SIGNING_KEY (see 3.3), or deploy the current config/keys.json.',
        );
      }
      // What people see: the key shown on the verify and about pages, which is built into the site's script.
      const home = await fetchUrl(`${SITE_URL}/`);
      const scripts = [...home.text.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => new URL(m[1], `${SITE_URL}/`).href);
      let shown = false;
      for (const src of scripts) shown ||= (await fetchUrl(src)).text.includes(publicKey);
      const keyId = method.id.split('#')[1];
      return shown
        ? pass(`The private key (OB_SIGNING_KEY) belongs to ${keyId}, which the live site publishes in did.json and shows on /verify: ${publicKey}.`)
        : warn(`The private key belongs to ${keyId} in did.json, but the verify page does not show that key.`, DEPLOY_FIX);
    });

    await check('7.4', 'Revocation list', async () => {
      const live = await json<Revocation[]>(`${SITE_URL}/revocations.json`);
      if (!live) return fail(`${SITE_URL}/revocations.json is not published.`, DEPLOY_FIX);
      liveRevocations = live;
      const local = readJson<Revocation[]>(join(ROOT, 'config', 'revocations.json'));
      const same = live.map((r) => r.id).sort().join() === local.map((r) => r.id).sort().join();
      return same ? pass(`Published, with ${plural(live.length, 'revoked report')}.`) : warn('The published revocation list differs from config/revocations.json.', DEPLOY_FIX);
    });

    let index: ReportsIndex | undefined;
    await check('7.5', 'List of reports', async () => {
      index = await json<ReportsIndex>(`${SITE_URL}/data/reports.json`);
      if (!index) return fail(`${SITE_URL}/data/reports.json is not published, so the site lists nothing.`, DEPLOY_FIX);
      const local = listCredentials().filter(({ credential }) => !isTestSection(sectionIdOf(credential))).length;
      const online = index.published.length;
      return online === local
        ? pass(`${plural(online, 'published report')} and ${index.pending.length} awaiting signature, as in the repository.`)
        : warn(`The site lists ${online} published report(s); the repository has ${local}.`, DEPLOY_FIX);
    });

    /** Verifies a published report the way any outside verifier would: keys from the live DID document. */
    const verifyOnline = async (url: string) => {
      const credential = await json<JsonObject>(url);
      if (!credential) return { ok: false, why: 'not published' };
      const r = await verifyCredential(credential, { revoked: liveRevocations.map((x) => x.id), trustedIssuers: [ISSUER_DID] });
      return { ok: r.valid, why: r.checks.filter((c) => c.status === 'fail').map((c) => c.label.toLowerCase()).join(', ') };
    };

    await check('7.6', 'Specimen report verifies online', async () => {
      const r = await verifyOnline(urls.credential(SPECIMEN_SLUG));
      return r.ok
        ? pass(`${urls.credential(SPECIMEN_SLUG)} is genuine, checked against the published DID document.`)
        : fail(`${urls.credential(SPECIMEN_SLUG)}: ${r.why}.`, DEPLOY_FIX);
    });

    await check('7.7', 'Published reports verify online', async () => {
      const published = index?.published ?? [];
      if (published.length === 0) return pass('No reports published yet.');
      const bad: string[] = [];
      for (const e of published) {
        if (e.revoked) continue;
        const r = await verifyOnline(urls.credential(e.slug));
        if (!r.ok) bad.push(`${e.slug} (${r.why})`);
      }
      return bad.length
        ? fail(`Not genuine online: ${listing(bad)}.`, DEPLOY_FIX)
        : pass(`All ${plural(published.length, 'published report')} are genuine, checked against the published DID document.`);
    });

    await check('7.8', 'Submission schema', async () =>
      (await json(urls.submissionSchema()))
        ? pass(`${urls.submissionSchema()} is published, for people writing submissions by hand.`)
        : warn(`${urls.submissionSchema()} is not published.`, DEPLOY_FIX),
    );
  },
});
