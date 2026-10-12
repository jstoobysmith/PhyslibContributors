import { Link } from 'react-router-dom';
import { ACCEPT_COMMAND } from '../lib/issue-submission';
import { Content } from '../components/Content';
import { Container, PageTitle } from '../components/ui';
import { WorkflowDiagram } from '../components/WorkflowDiagram';
import { ISSUER_DID, MAINTAINERS, SECTIONS, SIGNING_KEY, SITE, SITE_URL, urls } from '../lib/config';
import { PREFILL_PARAMETERS, prefillParams } from '../lib/prefill';
import { asset } from '../site/data';
import { useTitle } from '../site/useTitle';

const CONTENTS = [
  ['purpose', 'Purpose'],
  ['maintainers', 'Who reviews reports'],
  ['process', 'How a report is made'],
  ['prefill', 'Links that fill in the form'],
  ['meaning', 'What a report certifies'],
  ['sections', 'Sections'],
  ['revocation', 'Revoking a report'],
  ['trust', 'Signatures and keys'],
];

/** The example on this page: the link the form's "Copy a link" would make for it. */
const EXAMPLE_QUERY = prefillParams({
  section: 'review',
  name: 'Ada Example',
  github: 'ada-example',
  title: 'Reviewed 10 pull requests on quantum mechanics',
  from: '2026-07',
  to: '2026-07',
  prs: [1351, 1348, 1328],
})
  .toString()
  .replace(/\+/g, '%20')
  .replace(/%2C/g, ',');
const EXAMPLE_LINK = `${SITE_URL}/submit?${EXAMPLE_QUERY}`;

export default function About() {
  useTitle('About');
  const approvals = SITE.review.requiredApprovals;
  return (
    <Container className="grid gap-10 lg:grid-cols-[1fr_14rem]">
      <article className="min-w-0 max-w-3xl">
        <PageTitle title={`About ${SITE.title}`} />
        <div className="prose-long">
          <h2 id="purpose" className="!mt-0 scroll-mt-4">
            Purpose
          </h2>
          <Content file="about/purpose" />

          <h2 id="maintainers" className="scroll-mt-4">
            Who reviews reports
          </h2>
          <Content file="about/maintainers" />
          <ul>
            {MAINTAINERS.map((m) => (
              <li key={m.github}>
                <a href={urls.github(m.github)}>{m.name}</a>
                {m.role || m.affiliation ? ` (${[m.role, m.affiliation].filter(Boolean).join(', ')})` : ''}
              </li>
            ))}
          </ul>
          <p>{SITE.review.appointment}</p>
          <p>
            Reports are signed by an automatic step on GitHub (the signing workflow), which runs when a submission is accepted. It
            will only sign a report when all of these hold:
          </p>
          <ul>
            <li>
              {approvals === 1 ? 'at least one listed maintainer has' : `at least ${approvals} listed maintainers have`} approved the
              submission (by commenting “{ACCEPT_COMMAND}” on its issue, or approving its pull request), writing “
              {SITE.review.conflictDeclaration}” in their approval;
            </li>
            <li>
              none of those approvals comes from the contributor, anyone named as joint work, or whoever opened the issue or pull
              request;
            </li>
            <li>the submission was opened by the contributor, and has not been changed since it was approved;</li>
            <li>a pull request was not merged by anyone the report credits.</li>
          </ul>
          <p>
            The one exception is test submissions, made to try the process out: they are signed once a maintainer accepts them,
            without these rules, and their reports say they are tests and are not numbered or listed.
          </p>
          <Content file="about/approval-notes" />

          <h2 id="process" className="scroll-mt-4">
            How a report is made
          </h2>
          <Content file="about/process" />
          <WorkflowDiagram />
          <Content file="about/numbering" />

          <h2 id="prefill" className="scroll-mt-4">
            Links that fill in the form
          </h2>
          <p>
            A link to the submission form can fill it in, so you can send a contributor a submission that is ready to check and
            send: for example, one that collects the pull requests they reviewed. Opening such a link sends nothing; the
            contributor checks every field and sends it from their own GitHub account.
          </p>
          <p>The link is the address of the form, followed by any of the parameters below, joined with “&amp;”:</p>
          <pre className="my-3 overflow-x-auto border border-rule bg-shade p-3 font-mono text-xs leading-relaxed">
            {`${SITE_URL}/submit?section=…&name=…&github=…&title=…&prs=…`}
          </pre>
          <div className="my-3 overflow-x-auto">
            <table className="w-full font-sans text-sm">
              <thead>
                <tr className="border-b border-rule text-left">
                  <th className="py-1 pr-3 font-bold">Parameter</th>
                  <th className="py-1 pr-3 font-bold">Fills in</th>
                  <th className="py-1 font-bold">Example</th>
                </tr>
              </thead>
              <tbody>
                {PREFILL_PARAMETERS.map((p) => (
                  <tr key={p.name} className="border-b border-rule/60 align-top">
                    <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{p.name}</td>
                    <td className="py-1.5 pr-3">{p.fills}</td>
                    <td className="py-1.5 font-mono text-xs [overflow-wrap:anywhere]">{p.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Spaces and other special characters are written in the usual way for web addresses: a space as %20, a comma inside a
            title or summary as %2C. For example, this link fills in a review report with three pull requests:
          </p>
          <pre className="my-3 overflow-x-auto border border-rule bg-shade p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
            {EXAMPLE_LINK}
          </pre>
          <p>
            <Link to={`/submit?${EXAMPLE_QUERY}`}>Open this example</Link>
            . There is no need to write links by hand: fill in the <Link to="/submit">submission form</Link> and use{' '}
            <em>Copy a link to this form</em>, beside it. Opening a link replaces any draft saved in that browser.
          </p>

          <h2 id="meaning" className="scroll-mt-4">
            What a report certifies
          </h2>
          <Content file="about/meaning" />

          <h2 id="sections" className="scroll-mt-4">
            Sections
          </h2>
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <Link to={`/sections/${s.id}`}>
                  {s.numeral}. {s.name}
                </Link>
                : {s.summary.replace(/^For /, 'for ')}
              </li>
            ))}
          </ul>

          <h2 id="revocation" className="scroll-mt-4">
            Revoking a report
          </h2>
          <Content file="about/revocation" />

          <h2 id="trust" className="scroll-mt-4">
            Signatures and keys
          </h2>
          <p>
            The <a href="#process">diagram above</a> shows where each key is kept. Each report is an{' '}
            <a href="https://www.imsglobal.org/spec/ob/v3p0/">Open Badges 3.0</a> credential, a standard format
            for digital certificates. It is signed with a private key held as a secret of a protected GitHub environment, which only
            the signing workflow on the main branch can use; any change to the workflows or code on the main branch needs a
            maintainer’s review. The matching
            public key{SIGNING_KEY && (
              <>
                , <code className="break-all font-mono text-sm">{SIGNING_KEY.publicKeyMultibase}</code>,
              </>
            )}{' '}
            is shown on the <Link to="/verify#key">verify page</Link> and published in the issuer’s{' '}
            <a href={asset('did.json')}>DID document</a> (<code className="break-all font-mono text-sm">{ISSUER_DID}</code>), so
            anyone can check the signature, here or with any other Open Badges 3.0 verifier.
          </p>
          <p>
            {SIGNING_KEY?.status === 'temporary' ? (
              <>
                Reports are currently signed with a temporary key while the site is being set up. The permanent key will be
                published in the DNS of physlib.io (at <code className="font-mono text-sm">{SITE.dns.txtName}</code>), which ties
                it to the Physlib project independently of this website.
              </>
            ) : (
              <>
                The key is also published in the DNS of physlib.io (at <code className="font-mono text-sm">{SITE.dns.txtName}</code>
                ), which ties it to the Physlib project independently of this website.
              </>
            )}{' '}
            When a key is replaced, existing reports are signed again with
            the new key without changing their content. If a key were ever compromised, it would be removed from the DID
            document, so that nothing it signed would verify, and the affected reports would be signed again.
          </p>
        </div>
      </article>

      <aside className="hidden text-sm lg:block">
        <div className="panel sticky top-4">
          <div className="panel-title">Contents</div>
          <ul className="space-y-1 px-3 py-2">
            {CONTENTS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </Container>
  );
}
