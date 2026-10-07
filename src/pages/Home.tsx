import { Link } from 'react-router-dom';
import { AwardList } from '../components/AwardListing';
import { Container, Spinner } from '../components/ui';
import { SECTIONS, SITE, SPECIMEN_SLUG, urls } from '../lib/config';
import { useAwards } from '../site/data';
import { useTitle } from '../site/useTitle';

export default function Home() {
  useTitle();
  const awards = useAwards();
  const published = awards.status === 'ready' ? awards.data.published : [];

  return (
    <Container className="grid gap-x-10 gap-y-8 lg:grid-cols-[1fr_16rem]">
      <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
        <h1 className="sr-only">{SITE.title}</h1>
        <p className="max-w-3xl font-serif text-[1.0625rem] leading-relaxed">
          <strong>{SITE.title}</strong> gives awards for work on <a href={SITE.physlib.site}>Physlib</a> that papers do not
          capture: reviewing, maintenance, refactoring and foundational definitions. Anyone can submit their own work or
          nominate someone else. The Physlib maintainers check each submission in public, and accepted awards are digitally
          signed so that anyone can confirm they are genuine.
        </p>
        <p className="mt-3 text-sm">
          <Link to="/submit" className="font-bold">
            Submit a contribution
          </Link>{' '}
          · <Link to="/about">How it works</Link> · <Link to="/about#maintainers">Who reviews awards</Link> ·{' '}
          <Link to="/verify">Check an award</Link>
        </p>
      </div>

      <div className="order-3 min-w-0 lg:col-start-1 lg:row-start-2">

        <h2 className="border-b border-rule pb-1 font-serif text-xl font-bold">Sections</h2>
        <ul className="mt-2 space-y-2">
          {SECTIONS.map((s) => {
            const n = published.filter((e) => e.section === s.id).length;
            return (
              <li key={s.id}>
                <Link to={`/sections/${s.id}`} className="font-bold">
                  {s.numeral}. {s.name}
                </Link>{' '}
                <span className="text-muted">— {s.summary}</span>{' '}
                <span className="text-sm text-muted">
                  ({n} {n === 1 ? 'award' : 'awards'})
                </span>
              </li>
            );
          })}
        </ul>

        <h2 className="mt-8 border-b border-rule pb-1 font-serif text-xl font-bold">Latest awards</h2>
        {awards.status === 'loading' && <Spinner />}
        {awards.status === 'error' && <p className="py-3 text-sm text-muted">The list of awards could not be loaded.</p>}
        {awards.status === 'ready' && published.length === 0 && (
          <p className="py-3 text-sm">
            No awards have been given yet. The <Link to={`/awards/${SPECIMEN_SLUG}`}>specimen award</Link> shows what one looks like.
          </p>
        )}
        {published.length > 0 && (
          <>
            <AwardList entries={published.slice(0, 8)} />
            <p className="mt-2 text-sm">
              <Link to="/archive">All awards</Link>
            </p>
          </>
        )}
      </div>

      {/* On phones the newcomer panel follows the introduction; on wide screens it sits on the right. */}
      <aside className="order-2 space-y-4 text-sm lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <div className="panel">
          <div className="panel-title">New to Physlib?</div>
          <div className="space-y-2 px-3 py-2">
            <p>Physlib is a library of physics written in the Lean 4 proof assistant. To start contributing:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <a href={SITE.physlib.gettingStarted}>Getting started with Physlib</a>
              </li>
              <li>
                <a href={urls.goodFirstIssues()}>Good first issues</a>
              </li>
              <li>
                <a href={SITE.physlib.zulip}>Ask on Zulip</a>
              </li>
            </ul>
            <p className="text-xs text-muted">
              Reviewing and maintenance are good ways to start contributing. Done regularly over a few months, they are also the
              most common first awards.
            </p>
          </div>
        </div>
      </aside>
    </Container>
  );
}
