import { Link, useParams } from 'react-router-dom';
import { AwardList } from '../components/AwardListing';
import { BadgeImage, Container, PageTitle, Spinner } from '../components/ui';
import { EVIDENCE_KINDS, SECTIONS, sectionById } from '../lib/config';
import { asset, useAwards } from '../site/data';
import NotFound from './NotFound';
import { useTitle } from '../site/useTitle';

export function SectionsIndex() {
  useTitle('Sections');
  return (
    <Container className="max-w-4xl">
      <PageTitle title="Sections">
        Awards are given in four sections, each with its own criteria. The maintainers apply these criteria when they review a
        submission.
      </PageTitle>
      <ol className="space-y-5">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <h2 className="font-serif text-xl font-bold">
              <Link to={`/sections/${s.id}`} className="text-foreground">
                {s.numeral}. {s.name}
              </Link>
            </h2>
            <p className="mt-1">{s.description}</p>
            <p className="mt-1 text-sm">
              <Link to={`/sections/${s.id}`}>Criteria</Link> · <Link to={`/archive?section=${s.id}`}>Awards</Link> ·{' '}
              <Link to={`/submit?section=${s.id}`}>Submit</Link>
            </p>
          </li>
        ))}
      </ol>
    </Container>
  );
}

export function SectionPage() {
  const { id = '' } = useParams();
  const section = sectionById(id);
  const awards = useAwards();
  useTitle(section ? `${section.numeral}. ${section.name}` : undefined);
  if (!section) return <NotFound />;
  const entries = awards.status === 'ready' ? awards.data.published.filter((e) => e.section === section.id) : [];

  return (
    <Container className="grid gap-10 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0">
        <p className="text-sm text-muted">
          <Link to="/sections">Sections</Link> › {section.numeral}. {section.name}
        </p>
        <PageTitle title={`${section.numeral}. ${section.name}`}>{section.awardName}</PageTitle>
        <div className="prose-long max-w-3xl">
          <p>{section.description}</p>
          <h2>Criteria</h2>
          <p>A submission to this section is accepted when:</p>
          <ol>
            {section.criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <h2>How much work is one award?</h2>
          <p>{section.guidance}</p>
          <p>
            Typical evidence:{' '}
            {section.evidenceKinds
              .filter((k) => k !== 'other')
              .map((k) => EVIDENCE_KINDS[k])
              .join(', ')}
            .
          </p>
        </div>

        <h2 className="mt-8 border-b border-rule pb-1 font-serif text-xl font-bold">Awards in this section</h2>
        {awards.status === 'loading' && <Spinner />}
        {awards.status === 'ready' && entries.length === 0 && (
          <p className="py-3 text-sm">
            None yet. <Link to={`/submit?section=${section.id}`}>Submit a contribution</Link>.
          </p>
        )}
        <AwardList entries={entries} showSummary />
      </div>

      <aside className="space-y-4 text-sm">
        <div className="panel">
          <div className="panel-title">Award</div>
          <div className="px-3 py-3 text-center">
            <BadgeImage section={section} className="mx-auto w-32" />
            <p className="mt-2">{section.awardName}</p>
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">Links</div>
          <ul className="space-y-1 px-3 py-2">
            <li>
              <Link to={`/submit?section=${section.id}`}>Submit to this section</Link>
            </li>
            <li>
              <a href={asset(`achievements/${section.id}.json`)}>Award definition (Open Badges 3.0)</a>
            </li>
          </ul>
        </div>
      </aside>
    </Container>
  );
}
