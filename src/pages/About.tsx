import { Link } from 'react-router-dom';
import { Container, PageTitle } from '../components/ui';
import { ISSUER_DID, MAINTAINERS, SECTIONS, SITE, urls } from '../lib/config';
import { asset } from '../site/data';
import { useTitle } from '../site/useTitle';

const CONTENTS = [
  ['purpose', 'Purpose'],
  ['maintainers', 'Who reviews awards'],
  ['process', 'How an award is made'],
  ['meaning', 'What an award certifies'],
  ['sections', 'Sections'],
  ['revocation', 'Revoking an award'],
  ['trust', 'Signatures and keys'],
];

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
          <p>
            Much of the work that makes <a href={SITE.physlib.site}>Physlib</a> usable is not credited by papers: reviewing other
            people’s changes, keeping the library building as Lean and Mathlib change, restructuring code, and setting up basic
            definitions. {SITE.title} gives that work a public record that the contributor can point to, with links to the work
            itself and the names of the maintainers who checked it.
          </p>
          <p>
            Awards are optional. Many valuable contributions are never submitted, and the absence of an award says nothing about
            a person’s work. Awards record work; they do not rank people.
          </p>

          <h2 id="maintainers" className="scroll-mt-4">
            Who reviews awards
          </h2>
          <p>
            {SITE.title} is run by the maintainers of its <a href={urls.repo()}>GitHub repository</a>. They review submissions
            and approve awards:
          </p>
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
            Awards are signed by an automatic step on GitHub (the signing workflow), which runs when a submission is merged. It will
            only sign an award when all of these hold:
          </p>
          <ul>
            <li>
              {approvals === 1 ? 'at least one listed maintainer has' : `at least ${approvals} listed maintainers have`} approved the
              submission’s pull request, writing “{SITE.review.conflictDeclaration}” in their approval;
            </li>
            <li>
              none of those approvals comes from the recipient, anyone named as joint work, the nominator, or whoever opened the
              pull request;
            </li>
            <li>the pull request was not merged by anyone the award credits.</li>
          </ul>
          <p>
            The workflow can check who is named in a submission, but not other relationships: a maintainer who supervises or
            works closely with the recipient is trusted not to approve. If every listed maintainer has such a conflict, the
            submission waits until another maintainer is appointed. Maintainers can receive awards
            themselves under the same rules, approved by the others.
          </p>
          <p>
            Maintainers review submissions as volunteers, with no promised turnaround. They may ask for changes, and may close a
            submission that does not clearly meet the criteria without giving detailed reasons.
          </p>

          <h2 id="process" className="scroll-mt-4">
            How an award is made
          </h2>
          <ol>
            <li>
              Someone fills in the <Link to="/submit">submission form</Link>: a title, a short summary and links to the pull
              requests, reviews or modules that make up the work. This opens a pull request on GitHub.
            </li>
            <li>The maintainers check the evidence against the section’s criteria, in public on the pull request, and may ask for changes.</li>
            <li>When the pull request has the required approvals, a maintainer merges it.</li>
            <li>
              A GitHub workflow then signs the award and publishes it here, usually within a few minutes. The award records the
              pull request, who approved it and who merged it.
            </li>
          </ol>
          <p>
            Awards are numbered in the order they are signed, starting from 1, and keep their number permanently. They are
            usually referred to as, for example, “Physlib Contributions award no. 3 (2026)”.
          </p>

          <h2 id="meaning" className="scroll-mt-4">
            What an award certifies
          </h2>
          <p>
            For readers such as hiring or promotion committees: an award certifies that Physlib maintainers looked at the linked
            work and agreed that it meets the published criteria of its section. It does not measure the quality of the work
            beyond that, and it is not peer review of a research result. The linked pull requests are the primary record, and
            they show the work in full.
          </p>

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
            Revoking an award
          </h2>
          <p>
            A signed award is never edited. If one has to be withdrawn, because it was given in error or because its recipient
            asks for it to be removed, the maintainers add it to a public revocation list. The award page and this site’s
            verifier then show it as revoked.
          </p>

          <h2 id="trust" className="scroll-mt-4">
            Signatures and keys
          </h2>
          <p>
            Each award is an <a href="https://www.imsglobal.org/spec/ob/v3p0/">Open Badges 3.0</a> credential, a standard format
            for digital certificates. It is signed with a private key held as a secret of a protected GitHub environment, which only
            the signing workflow on the main branch can use; any change to the workflows or code on the main branch needs a
            maintainer’s review. The matching
            public key is published in the issuer’s <a href={asset('did.json')}>DID document</a> (
            <code className="break-all font-mono text-sm">{ISSUER_DID}</code>), so anyone can check the signature, here or with
            any other Open Badges 3.0 verifier.
          </p>
          <p>
            Awards are currently signed with a temporary key while the site is being set up. The permanent key will be
            published in the DNS of physlib.io (at <code className="font-mono text-sm">{SITE.dns.txtName}</code>), which ties it
            to the Physlib project independently of this website. When a key is replaced, existing awards are signed again with
            the new key without changing their content. If a key were ever compromised, it would be removed from the DID
            document, so that nothing it signed would verify, and the affected awards would be signed again.
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
