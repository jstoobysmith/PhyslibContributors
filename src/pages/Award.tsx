import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import Prose from '../components/Prose';
import VerificationPanel from '../components/VerificationPanel';
import { BadgeImage, Container, ErrorNote, linkButtonClass, OrcidIcon, Spinner } from '../components/ui';
import { maintainerByLogin, sectionById, SPECIMEN_SLUG, urls } from '../lib/config';
import { bakeSvg } from '../lib/baking';
import { evidenceOf, recipientOf, reviewParticipants, sectionIdOf, titleOf, type OpenBadgeCredential } from '../lib/credential';
import { awardReference, citations, cvLine, linkedInUrl, whatItMeans, type AwardEntry } from '../lib/awards';
import type { JsonObject } from '../lib/dataIntegrity';
import { asset, credentialPath, download, formatDate, useAwards, useCredential } from '../site/data';
import { useTitle } from '../site/useTitle';

async function downloadBakedBadge(slug: string, sectionId: string, credential: OpenBadgeCredential) {
  const svg = await (await fetch(asset(`badges/${sectionId}.svg`))).text();
  download(`${slug}.svg`, bakeSvg(svg, credential), 'image/svg+xml');
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) +
  ' UTC';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="align-top">
      <th scope="row" className="w-28 py-1 pr-4 text-left font-bold whitespace-nowrap">
        {label}:
      </th>
      <td className="min-w-0 py-1 break-words">{children}</td>
    </tr>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 border-b border-rule pb-1 font-serif text-lg font-bold">{children}</h2>;
}

/** A GitHub login, shown as the maintainer's name when they are listed. */
function Person({ login }: { login: string }) {
  const m = maintainerByLogin(login);
  return m ? (
    <Link to="/about#maintainers" title={`@${login}`}>
      {m.name}
    </Link>
  ) : (
    <a href={urls.github(login)}>@{login}</a>
  );
}

/** "A", "A and B", "A, B and C". */
const join = (items: ReactNode[]) => items.flatMap((x, i) => (i === 0 ? [x] : [i === items.length - 1 ? ' and ' : ', ', x]));

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words bg-shade p-2 font-mono text-xs">{text}</pre>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
        className="mt-1 text-xs text-link hover:underline"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </>
  );
}

function UsingThisAward({ c, slug, entry }: { c: OpenBadgeCredential; slug: string; entry?: AwardEntry }) {
  const [format, setFormat] = useState<'cv' | 'text' | 'bibtex'>('cv');
  const cite = citations(c, slug, entry);
  const text = format === 'cv' ? cvLine(c, slug, entry) : cite[format];
  const tab = (f: typeof format, label: string) =>
    format === f ? (
      <strong>{label}</strong>
    ) : (
      <button type="button" className={linkButtonClass} onClick={() => setFormat(f)}>
        {label}
      </button>
    );
  return (
    <div className="panel text-sm">
      <div className="panel-title">Using this award</div>
      <div className="space-y-2 px-3 py-2">
        <p className="text-xs">
          {tab('cv', 'CV line')} | {tab('text', 'Reference')} | {tab('bibtex', 'BibTeX')}
        </p>
        <CopyBox text={text} />
        <p className="text-xs text-muted">On a CV this fits under “Awards” or “Open-source contributions”.</p>
        <p>
          <a href={linkedInUrl(c, slug)}>Add to LinkedIn profile</a>
        </p>
      </div>
    </div>
  );
}

export default function Award() {
  const { slug = '' } = useParams();
  const credential = useCredential(slug);
  const awards = useAwards();
  useTitle(credential.status === 'ready' ? titleOf(credential.data) : undefined);

  if (credential.status === 'loading') {
    return (
      <Container>
        <Spinner label="Loading award" />
      </Container>
    );
  }
  if (credential.status === 'error') {
    return (
      <Container>
        <ErrorNote>
          There is no award at this address. <Link to="/archive">See all awards</Link>.
        </ErrorNote>
      </Container>
    );
  }

  const c = credential.data;
  const specimen = slug === SPECIMEN_SLUG;
  const entry = awards.status === 'ready' ? awards.data.published.find((e) => e.slug === slug) : undefined;
  const section = sectionById(sectionIdOf(c));
  const recipient = recipientOf(c);
  const { work, review } = evidenceOf(c);
  const people = reviewParticipants(review?.description);
  const subject = c.credentialSubject;

  return (
    <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <article className="min-w-0">
        {specimen && (
          <p className="mb-4 border border-warning/40 bg-[#fdf8e8] px-3 py-2 text-sm">
            <strong>Specimen.</strong> A sample award showing what a real one looks like. The recipient does not exist.
          </p>
        )}
        {entry?.revoked && (
          <p className="mb-4 border border-danger/40 bg-[#fdf3f2] px-3 py-2 text-sm font-bold text-danger">This award has been revoked.</p>
        )}

        <p className="text-sm text-muted">
          {entry && <>Award no. {entry.number} · </>}
          {section && (
            <Link to={`/sections/${section.id}`}>
              {section.numeral}. {section.name}
            </Link>
          )}{' '}
          · accepted {formatDate(c.validFrom)}
        </p>

        <h1 className="mt-2 font-serif text-[1.75rem] font-bold leading-tight">{titleOf(c)}</h1>
        <p className="mt-2 text-[1.0625rem]">
          {recipient.github && !specimen ? <Link to={`/contributors/${recipient.github}`}>{recipient.name}</Link> : recipient.name}
          {recipient.orcid && (
            <a href={`https://orcid.org/${recipient.orcid}`} className="ml-3 text-sm">
              <OrcidIcon className="size-4" /> {recipient.orcid}
            </a>
          )}
        </p>
        {entry?.collaborators?.length ? (
          <p className="text-sm text-muted">
            Joint work with{' '}
            {join(
              entry.collaborators.map((p) => (
                <Link key={p.github} to={`/contributors/${p.github}`}>
                  {p.name}
                </Link>
              )),
            )}
          </p>
        ) : null}

        <div className="mt-5 font-serif text-[1.0625rem] leading-relaxed">
          <Prose text={subject.narrative ?? ''} />
        </div>

        <table className="mt-6 w-full table-fixed text-sm">
          <tbody>
            <Row label="Award">{c.credentialSubject.achievement.name}</Row>
            {subject.activityStartDate && subject.activityEndDate && (
              <Row label="Work period">
                {formatDate(subject.activityStartDate, { month: 'long', year: 'numeric' })} –{' '}
                {formatDate(subject.activityEndDate, { month: 'long', year: 'numeric' })}
              </Row>
            )}
            {entry && <Row label="Reference">{awardReference(entry)}</Row>}
            {recipient.github && !specimen && (
              <Row label="GitHub">
                <a href={urls.github(recipient.github)}>@{recipient.github}</a>
              </Row>
            )}
          </tbody>
        </table>

        <Heading>Evidence</Heading>
        <ol className="mt-2 space-y-2 text-sm">
          {work.map((e, i) => (
            <li key={(e.id ?? '') + i} className="grid grid-cols-[2rem_minmax(0,1fr)]">
              <span className="text-muted">[{i + 1}]</span>
              <span>
                {e.id ? <a href={e.id}>{e.name ?? e.id}</a> : e.name}
                {e.genre && <span className="text-muted"> ({e.genre})</span>}
                {e.description && <span className="block text-muted">{e.description}</span>}
              </span>
            </li>
          ))}
        </ol>

        <Heading>How this award was checked</Heading>
        <div className="mt-2 space-y-1 text-sm">
          {review ? (
            <>
              <p>
                Reviewed on <a href={review.id}>pull request #{review.id?.split('/').pop()}</a>
                {people.submittedBy &&
                  (people.submittedBy.toLowerCase() === recipient.github?.toLowerCase() ? (
                    ', submitted by the recipient'
                  ) : (
                    <>
                      , submitted by <Person login={people.submittedBy} />
                    </>
                  ))}
                .
              </p>
              {people.approvedBy.length > 0 && (
                <p>
                  Approved
                  {people.approvedBy.length === 1 && people.mergedBy === people.approvedBy[0] ? ` and accepted on ${formatDate(c.validFrom)}` : ''}{' '}
                  by {join(people.approvedBy.map((l) => <Person key={l} login={l} />))}
                  {people.declaredNoConflict ? `, ${people.approvedBy.length > 1 ? 'each of whom' : 'who'} declared no conflict of interest` : ''}.
                </p>
              )}
              {people.mergedBy && !(people.approvedBy.length === 1 && people.mergedBy === people.approvedBy[0]) && (
                <p>
                  Accepted by <Person login={people.mergedBy} /> on {formatDate(c.validFrom)}.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">{specimen ? 'A real award links the pull request on which it was reviewed.' : 'Accepted by the maintainers.'}</p>
          )}
          <p className="pt-1 text-muted">{whatItMeans(c)}</p>
        </div>

        {section && (
          <>
            <Heading>
              Criteria for this award <Link to={`/sections/${section.id}`} className="font-sans text-sm font-normal">(section page)</Link>
            </Heading>
            <ol className="mt-2 ml-5 list-decimal space-y-1 text-sm">
              {section.criteria.map((cr) => (
                <li key={cr}>{cr}</li>
              ))}
            </ol>
          </>
        )}

        <details className="mt-8 border-t border-rule pt-3 text-sm">
          <summary className="cursor-pointer font-serif text-lg font-bold">Technical details</summary>
          <table className="mt-2 w-full table-fixed">
            <tbody>
              <Row label="Format">Open Badges 3.0 (W3C Verifiable Credential 2.0)</Row>
              <Row label="Credential">
                <a href={credentialPath(slug)} className="break-all">
                  {c.id}
                </a>
              </Row>
              <Row label="Issuer">
                <span className="break-all font-mono text-xs">{c.issuer.id}</span>
              </Row>
              {c.proof && (
                <>
                  <Row label="Signature">
                    {c.proof.cryptosuite}, {dateTime(c.proof.created)}
                  </Row>
                  <Row label="Key">
                    <span className="break-all font-mono text-xs">{c.proof.verificationMethod}</span>
                  </Row>
                </>
              )}
            </tbody>
          </table>
          <pre className="mt-2 max-h-[32rem] overflow-auto border border-rule bg-shade p-3 font-mono text-xs">{JSON.stringify(c, null, 2)}</pre>
        </details>
      </article>

      <aside className="min-w-0 space-y-4 text-sm">
        <VerificationPanel credential={c as unknown as JsonObject} />
        <UsingThisAward c={c} slug={slug} entry={entry} />
        <div className="panel">
          <div className="panel-title">Download</div>
          <ul className="space-y-1 px-3 py-2">
            <li>
              <a href={credentialPath(slug)} download={`${slug}.json`}>
                Signed credential (JSON)
              </a>
            </li>
            {section && (
              <li>
                <button type="button" className={`${linkButtonClass} text-left`} onClick={() => downloadBakedBadge(slug, section.id, c)}>
                  Badge image with the credential inside (SVG)
                </button>
              </li>
            )}
          </ul>
          <p className="px-3 pb-2 text-xs text-muted">
            Optional. Either file can be kept in a digital-certificate app (an “Open Badges wallet”); most people will not need this.
          </p>
          {section && (
            <div className="border-t border-rule px-3 py-3 text-center">
              <BadgeImage section={section} className="mx-auto w-24" />
            </div>
          )}
        </div>
      </aside>
    </Container>
  );
}
