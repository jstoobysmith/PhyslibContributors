import { useMemo, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AwardList } from '../components/AwardListing';
import { buttonClass, Container, inputClass, PageTitle, Spinner } from '../components/ui';
import { SECTIONS, sectionById, SPECIMEN_SLUG } from '../lib/config';
import { formatDate, useAwards, useUnderReview } from '../site/data';
import type { AwardEntry } from '../lib/awards';
import { useTitle } from '../site/useTitle';

/** Open submission pull requests. Shown only when GitHub can be reached. */
function UnderReview() {
  const prs = useUnderReview();
  if (prs.status !== 'ready') return null;
  return (
    <div className="panel">
      <div className="panel-title">Under review</div>
      <div className="px-3 py-2">
        {prs.data.length === 0 ? (
          <p className="text-muted">No open submissions.</p>
        ) : (
          <ul className="space-y-2">
            {prs.data.map((p) => (
              <li key={p.number}>
                <a href={p.url}>{p.title}</a>
                <span className="block text-xs text-muted">
                  #{p.number}, @{p.user}, opened {formatDate(p.createdAt, { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Archive() {
  useTitle('All awards');
  const awards = useAwards();
  const [params, setParams] = useSearchParams();
  const section = params.get('section') ?? '';
  const query = params.get('q') ?? '';

  /** The archive URL with some query parameters changed (empty values are removed). */
  const withParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const q = next.toString();
    return q ? `/archive?${q}` : '/archive';
  };

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };

  const years = useMemo(() => {
    if (awards.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    const filtered = awards.data.published.filter(
      (e) =>
        (!section || e.section === section) &&
        (!q ||
          [e.title, e.recipient.name, e.recipient.github ?? '', ...(e.collaborators ?? []).flatMap((c) => [c.name, c.github])].some((s) =>
            s.toLowerCase().includes(q),
          )),
    );
    const byYear = new Map<number, AwardEntry[]>();
    for (const e of filtered) byYear.set(e.year, [...(byYear.get(e.year) ?? []), e]);
    return [...byYear].sort(([a], [b]) => b - a);
  }, [awards, section, query]);

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    update({ q: String(new FormData(e.currentTarget).get('q') ?? '').trim() });
  };

  const total = years.reduce((n, [, entries]) => n + entries.length, 0);

  return (
    <Container className="grid gap-10 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0">
        <PageTitle title="All awards">Every published award, by year, most recent first.</PageTitle>

        <div className="space-y-2 text-sm">
          <p>
            <span className="font-bold">Section:</span>{' '}
            {[{ id: '', label: 'All' }, ...SECTIONS.map((s) => ({ id: s.id, label: `${s.numeral}. ${s.name}` }))].map((s, i) => (
              <span key={s.id}>
                {i > 0 && ' | '}
                {section === s.id ? (
                  <strong>{s.label}</strong>
                ) : (
                  <Link to={withParams({ section: s.id })}>{s.label}</Link>
                )}
              </span>
            ))}
          </p>
          <form onSubmit={onSearch} className="flex max-w-md gap-2" key={query}>
            <input name="q" type="search" defaultValue={query} placeholder="Title, recipient or GitHub username" aria-label="Search awards" className={inputClass} />
            <button type="submit" className={buttonClass()}>
              Search
            </button>
          </form>
          {(query || section) && awards.status === 'ready' && (
            <p className="text-muted">
              {total} {total === 1 ? 'result' : 'results'}
              {query && <> for “{query}”</>}
              {section && <> in {sectionById(section)?.name}</>}. <Link to="/archive">Clear</Link>
            </p>
          )}
        </div>

        {awards.status === 'loading' && <Spinner />}
        {awards.status === 'error' && <p className="mt-6 text-muted">The list of awards could not be loaded.</p>}
        {awards.status === 'ready' && years.length === 0 && (
          <p className="mt-6">
            {awards.data.published.length === 0 ? (
              <>
                Nothing has been published yet. See the <Link to={`/awards/${SPECIMEN_SLUG}`}>specimen award</Link> for an example.
              </>
            ) : (
              'No awards match.'
            )}
          </p>
        )}
        {years.map(([year, entries]) => (
          <section key={year} className="mt-6">
            <h2 className="border-b border-rule pb-1 font-serif text-xl font-bold">
              {year}
              <span className="ml-2 font-sans text-sm font-normal text-muted">
                <span className="sr-only">: </span>
                {entries.length} {entries.length === 1 ? 'award' : 'awards'}
              </span>
            </h2>
            <AwardList entries={entries} />
          </section>
        ))}
      </div>

      <aside className="space-y-4 text-sm">
        <div className="panel">
          <div className="panel-title">Awaiting signature</div>
          <div className="px-3 py-2">
            <p className="mb-2 text-xs text-muted">Accepted, not yet signed.</p>
            {awards.status === 'ready' && awards.data.pending.length === 0 && <p className="text-muted">None at present.</p>}
            {awards.status === 'ready' && awards.data.pending.length > 0 && (
              <ul className="space-y-2">
                {awards.data.pending.map((e) => (
                  <li key={e.slug}>
                    {e.title}
                    <span className="block text-xs text-muted">
                      {e.recipient.name}; {sectionById(e.section)?.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <UnderReview />
      </aside>
    </Container>
  );
}
