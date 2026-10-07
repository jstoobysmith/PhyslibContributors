import { useState } from 'react';
import { Link } from 'react-router-dom';
import VerificationPanel, { CheckList } from '../components/VerificationPanel';
import { buttonClass, Container, ErrorNote, inputClass, linkButtonClass, PageTitle } from '../components/ui';
import { unbakeSvg } from '../lib/baking';
import { ISSUER_DID, KEYS, SIGNING_KEY, SITE, SITE_URL, SPECIMEN_SLUG, credentialFile } from '../lib/config';
import { recipientOf, slugOf, type OpenBadgeCredential } from '../lib/credential';
import type { JsonObject } from '../lib/dataIntegrity';
import { checkDnsAnchor, dnsCheck, dnsRecordFor } from '../lib/verify';
import { asset, useAsync } from '../site/data';
import { useTitle } from '../site/useTitle';

/** Pulls a credential out of pasted JSON, a baked SVG, or a URL. */
async function readCredential(input: string): Promise<JsonObject> {
  const text = input.trim();
  if (/^https?:\/\//.test(text)) {
    let res: Response;
    try {
      res = await fetch(text);
    } catch {
      throw new Error('That link could not be downloaded. Check it, or download the file and upload it here instead.');
    }
    if (!res.ok) throw new Error(`That link could not be downloaded (the server answered ${res.status}).`);
    const body = await res.text();
    if (/^\s*<!doctype html|^\s*<html/i.test(body)) {
      throw new Error('That link leads to a web page, not to a credential file. On a report page, use “Signed credential (JSON)”.');
    }
    return readCredential(body);
  }
  try {
    return JSON.parse(unbakeSvg(text) ?? text);
  } catch {
    throw new Error('This is not a credential. Paste the JSON file, a link to it, or a badge SVG with the credential inside.');
  }
}

const STATUS_TEXT = {
  active: 'in use',
  temporary: 'temporary, in use while the site is being set up',
  retired: 'retired; reports it signed still verify',
  revoked: 'revoked',
};

function KeyPanel() {
  const dns = useAsync(() => (SIGNING_KEY ? checkDnsAnchor(SIGNING_KEY.publicKeyMultibase) : Promise.reject(new Error('no key'))), []);
  return (
    <div id="key" className="panel scroll-mt-4 text-sm">
      <div className="panel-title">The public signing key</div>
      <div className="space-y-2 px-3 pt-2">
        <p>
          Reports are signed with a private key that only the signing workflow can use
          {SIGNING_KEY?.status === 'temporary' ? '. It is a temporary key, used while the site is being set up' : ''}. Anyone can check
          a signature with the matching public key:
        </p>
        {SIGNING_KEY && (
          <p>
            <span className="font-bold">Public key</span> <span className="text-muted">({SIGNING_KEY.id}, Ed25519)</span>
            <code className="mt-1 block break-all bg-shade p-1.5 font-mono text-xs">{SIGNING_KEY.publicKeyMultibase}</code>
          </p>
        )}
      </div>
      <details className="px-3 py-2">
        <summary className="cursor-pointer text-xs text-link">Technical details</summary>
        <div className="mt-2 space-y-3">
          <p>
            Reports are signed by <code className="break-all font-mono text-xs">{ISSUER_DID}</code>, whose public keys are listed in
            its <a href={asset('did.json')}>DID document</a>, the standard form that verifiers read.
          </p>
          <ul className="space-y-2">
            {KEYS.filter((k) => k.status !== 'revoked').map((k) => (
              <li key={k.id}>
                <span className="font-bold">{k.id}</span> <span className="text-muted">({STATUS_TEXT[k.status]})</span>
                <span className="block break-all font-mono text-xs">{k.publicKeyMultibase}</span>
              </li>
            ))}
          </ul>
          {SIGNING_KEY && (
            <div>
              <CheckList checks={[dnsCheck(dns.status === 'ready' ? dns.data : undefined, SIGNING_KEY.status)]} />
              <p className="mt-1 text-xs text-muted">
                The DNS record will read:
                <code className="mt-1 block break-all bg-shade p-1.5 font-mono text-[11px] text-foreground">
                  {SITE.dns.txtName} TXT "{dnsRecordFor(ISSUER_DID, SIGNING_KEY.publicKeyMultibase)}"
                </code>
              </p>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export default function Verify() {
  useTitle('Check a report');
  const [input, setInput] = useState('');
  const [credential, setCredential] = useState<JsonObject>();
  const [error, setError] = useState<string>();
  const [valid, setValid] = useState<boolean>();

  const run = async (text: string) => {
    setError(undefined);
    setCredential(undefined);
    setValid(undefined);
    try {
      setCredential(await readCredential(text));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setInput(text.length > 4000 ? `(${file.name})` : text);
    run(text);
  };

  const claimed = credential as unknown as OpenBadgeCredential | undefined;
  const ours = claimed?.id?.startsWith(SITE_URL + '/');

  return (
    <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <PageTitle title="Check a report">
          Paste a report’s credential, a link to it, or its badge image. This page checks that it was signed by {SITE.issuer.name} with a published key, that it has not been changed since, that it is in date, and that it has not been
          revoked. The first three are the standard Open Badges 3.0 checks, which any other verifier can repeat; the revocation
          list is published on this site.
        </PageTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(input);
          }}
        >
          <label htmlFor="credential" className="text-sm font-bold">
            Credential (JSON, link or SVG)
          </label>
          <textarea
            id="credential"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={7}
            placeholder='{"@context": ["https://www.w3.org/ns/credentials/v2", …'
            className={`${inputClass} mt-1 font-mono text-xs`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <button type="submit" className={buttonClass('primary')} disabled={!input.trim()}>
              Check
            </button>
            <label className={`${buttonClass()} cursor-pointer`}>
              Upload a file…
              <input type="file" accept=".json,.svg,application/json,image/svg+xml" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button
              type="button"
              className={linkButtonClass}
              onClick={() => {
                const url = new URL(asset(credentialFile(SPECIMEN_SLUG)), window.location.href).href;
                setInput(url);
                run(url);
              }}
            >
              Try the specimen report
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
        {credential && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <VerificationPanel credential={credential} onResult={setValid} />
            {valid === false && (
              <p className="text-sm text-danger">
                Do not rely on anything this credential says: it was not issued by {SITE.issuer.name}, or it has been changed or
                revoked.
              </p>
            )}
            {valid && (
              <div className="text-sm">
                <p className="text-xs text-muted">The credential says:</p>
                <p className="font-serif text-lg font-bold">{claimed?.credentialSubject?.achievement?.name ?? claimed?.name ?? 'Unknown report'}</p>
                {claimed?.credentialSubject && <p>Contributor: {recipientOf(claimed).name}</p>}
                <p className="text-muted">Issuer: {claimed?.issuer?.name ?? claimed?.issuer?.id ?? 'unknown'}</p>
                {ours && claimed && (
                  <p className="mt-2">
                    <Link to={`/reports/${slugOf(claimed)}`}>View the report page</Link>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <aside className="min-w-0">
        <KeyPanel />
      </aside>
    </Container>
  );
}
