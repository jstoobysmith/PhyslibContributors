import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ISSUER_DID, SIGNING_KEY, SITE } from '../lib/config';
import { ACCEPT_COMMAND } from '../lib/issue-submission';
import { asset } from '../site/data';

/** A small key, for the boxes that say where a key is kept. */
function KeyIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`inline-block size-4 shrink-0 align-[-3px] ${className}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M11 12 20 3M16 7l3 3M18 5l2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type KeyKind = 'secret' | 'public';

/** Where a key is kept and who can use it. Secret keys are dark; the public key is green. */
function KeyBox({ kind, title, children }: { kind: KeyKind; title: string; children: ReactNode }) {
  const style = kind === 'secret' ? 'border-band/60 bg-[#eef2f7] text-band' : 'border-success/50 bg-[#f1f8f3] text-success';
  return (
    <div className={`border px-3 py-2 ${style}`}>
      <p className="font-bold">
        <KeyIcon /> {title}
        <span className="ml-1.5 text-xs font-normal uppercase tracking-wide opacity-80">{kind === 'secret' ? 'secret' : 'public'}</span>
      </p>
      <div className="mt-1 text-xs leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

interface Stage {
  who: string;
  title: string;
  body: ReactNode;
  key?: { kind: KeyKind; title: string; body: ReactNode };
}

const code = (text: string) => <code className="font-mono text-[0.8em] [overflow-wrap:anywhere]">{text}</code>;

function stages(): Stage[] {
  const temporary = SIGNING_KEY?.status === 'temporary';
  return [
    {
      who: 'Contributor',
      title: 'Submits the work',
      body: (
        <>
          Fills in the <Link to="/submit">submission form</Link> and clicks <em>Submit on GitHub</em>. GitHub opens an issue in
          this site’s repository with the submission filled in.
        </>
      ),
    },
    {
      who: 'GitHub',
      title: 'Summary posted',
      body: 'An automatic check reads the submission and posts a summary on the issue: the criteria to check, warnings about the evidence, and the contributor’s previous reports.',
    },
    {
      who: 'Maintainers',
      title: 'Review in public',
      body: (
        <>
          They check the evidence on the issue and may ask for changes. A maintainer who is not involved accepts it by commenting “
          {ACCEPT_COMMAND} {SITE.review.conflictDeclaration}”.
        </>
      ),
    },
    {
      who: 'GitHub workflow',
      title: 'Accepted',
      body: 'The acceptance workflow checks the rules (who approved, conflicts, no edits since) and adds the submission to the repository’s main branch.',
      key: {
        kind: 'secret',
        title: 'Deploy key',
        body: (
          <>
            An SSH key stored as the secret {code('SIGNING_DEPLOY_KEY')} in the repository’s protected “signing” environment. It lets
            the workflows add accepted submissions and signed reports to the main branch, which otherwise changes only through
            reviewed pull requests.
          </>
        ),
      },
    },
    {
      who: 'GitHub workflow',
      title: 'Signed',
      body: 'The signing workflow checks the issue and the rules again, builds the report as an Open Badges 3.0 credential, gives it a number, and signs it.',
      key: {
        kind: 'secret',
        title: 'Private signing key',
        body: (
          <>
            Stored only as the secret {code('OB_SIGNING_KEY')} in the same “signing” environment, which only workflows on the main
            branch can use. It is never in the repository or on this site, and once stored no one can read it back, not even the
            maintainers.
          </>
        ),
      },
    },
    {
      who: 'This site',
      title: 'Published',
      body: 'The site is rebuilt with the signed report, which appears under its section and in the list of reports.',
      key: {
        kind: 'public',
        title: 'Public key',
        body: (
          <>
            Listed in the repository ({code('config/keys.json')}), published here in the issuer’s{' '}
            <a href={asset('did.json')}>DID document</a> ({code(ISSUER_DID)}) and shown on the <Link to="/verify#key">verify page</Link>
            . {temporary ? 'The permanent key will' : 'It is'} also {temporary ? 'be ' : ''}published in the DNS of physlib.io, at{' '}
            {code(SITE.dns.txtName)}.
          </>
        ),
      },
    },
    {
      who: 'Anyone',
      title: 'Checks the report',
      body: (
        <>
          On the <Link to="/verify">verify page</Link> or with any other Open Badges 3.0 verifier: it fetches the public key from the
          DID document and checks the signature. Any change to the report, even one character, makes the check fail.
        </>
      ),
    },
  ];
}

/**
 * The whole process, from submission to verification, with where each key is
 * kept. A numbered list, laid out as a flow chart: steps on the left, the keys
 * they use on the right (below, on narrow screens).
 */
export function WorkflowDiagram() {
  const list = stages();
  return (
    <figure className="my-5 font-sans text-sm">
      <ol className="flow">
        {list.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <div className="flex w-7 shrink-0 flex-col items-center">
              <span className="flex size-7 items-center justify-center rounded-full bg-band text-xs font-bold text-white">{i + 1}</span>
              {i < list.length - 1 && <span className="w-px flex-1 bg-rule" aria-hidden="true" />}
            </div>
            <div className="grid min-w-0 flex-1 gap-x-4 gap-y-2 pb-5 sm:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted">{s.who}</p>
                <p className="font-bold">{s.title}</p>
                <p className="mt-0.5 leading-relaxed">{s.body}</p>
              </div>
              {s.key && (
                <div className="sm:self-start">
                  <KeyBox kind={s.key.kind} title={s.key.title}>
                    {s.key.body}
                  </KeyBox>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="text-xs text-muted">
        Submissions can also be made as pull requests; the same rules apply, with approvals given as pull request reviews. If a
        key is replaced, the reports are signed again with the new one; a compromised key is removed from the DID document, so
        nothing it signed still verifies.
      </figcaption>
    </figure>
  );
}
