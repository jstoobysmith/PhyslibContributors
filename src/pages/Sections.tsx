import { Link, useParams } from 'react-router-dom';
import { ReportList } from '../components/ReportListing';
import { BadgeImage, Container, PageTitle, Spinner } from '../components/ui';
import { EVIDENCE_KINDS, SECTIONS, sectionById } from '../lib/config';
import { asset, useReports } from '../site/data';
import NotFound from './NotFound';
import { useTitle } from '../site/useTitle';

export function SectionsIndex() {
  useTitle('Sections');
  return (
    <Container className="max-w-4xl">
      <PageTitle title="Sections">
        Reports are published in four sections, each with its own criteria. The maintainers apply these criteria when they review a
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
              <Link to={`/sections/${s.id}`}>Criteria</Link> · <Link to={`/archive?section=${s.id}`}>Reports</Link> ·{' '}
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
  const reports = useReports();
  useTitle(section ? `${section.numeral}. ${section.name}` : undefined);
  if (!section) return <NotFound />;
  const entries = reports.status === 'ready' ? reports.data.published.filter((e) => e.section === section.id) : [];

  return (
    <Container className="grid gap-10 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0">
        <p className="text-sm text-muted">
          <Link to="/sections">Sections</Link> › {section.numeral}. {section.name}
        </p>
        <PageTitle title={`${section.numeral}. ${section.name}`}>{section.reportName}</PageTitle>
        <div className="prose-long max-w-3xl">
          <p>{section.description}</p>
          <h2>Criteria</h2>
          <p>A submission to this section is accepted when:</p>
          <ol>
            {section.criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <h2>How much work is one report?</h2>
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

        <h2 className="mt-8 border-b border-rule pb-1 font-serif text-xl font-bold">Reports in this section</h2>
        {reports.status === 'loading' && <Spinner />}
        {reports.status === 'ready' && entries.length === 0 && (
          <p className="py-3 text-sm">
            None yet. <Link to={`/submit?section=${section.id}`}>Submit a contribution</Link>.
          </p>
        )}
        <ReportList entries={entries} showSummary />
      </div>

      <aside className="space-y-4 text-sm">
        <div className="panel">
          <div className="panel-title">Series</div>
          <div className="px-3 py-3 text-center">
            <BadgeImage section={section} className="mx-auto w-32" />
            <p className="mt-2">{section.reportName}</p>
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">Links</div>
          <ul className="space-y-1 px-3 py-2">
            <li>
              <Link to={`/submit?section=${section.id}`}>Submit to this section</Link>
            </li>
            <li>
              <a href={asset(`achievements/${section.id}.json`)}>Series definition (Open Badges 3.0)</a>
            </li>
          </ul>
        </div>
      </aside>
    </Container>
  );
}
