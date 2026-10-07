import { useParams } from 'react-router-dom';
import { ReportList } from '../components/ReportListing';
import { Container, OrcidIcon, PageTitle, Spinner } from '../components/ui';
import { urls } from '../lib/config';
import { useReports } from '../site/data';
import { useTitle } from '../site/useTitle';

export default function Contributor() {
  const { login = '' } = useParams();
  const reports = useReports();
  const same = (l?: string) => l?.toLowerCase() === login.toLowerCase();
  const published = reports.status === 'ready' ? reports.data.published.filter((e) => !e.revoked) : [];
  const own = published.filter((e) => same(e.recipient.github));
  const joint = published.filter((e) => e.collaborators?.some((c) => same(c.github)));
  const name = own[0]?.recipient.name ?? joint[0]?.collaborators?.find((c) => same(c.github))?.name ?? login;
  const orcid = own.find((e) => e.recipient.orcid)?.recipient.orcid;
  useTitle(name);

  return (
    <Container className="max-w-4xl">
      <PageTitle title={name}>
        <a href={urls.github(login)}>@{login}</a> on GitHub
        {orcid && (
          <>
            {' · '}
            <a href={`https://orcid.org/${orcid}`}>
              <OrcidIcon className="size-4" /> {orcid}
            </a>
          </>
        )}
      </PageTitle>
      {reports.status === 'loading' && <Spinner />}
      {reports.status === 'ready' && own.length === 0 && joint.length === 0 && <p>No reports.</p>}
      {own.length > 0 && (
        <>
          <h2 className="border-b border-rule pb-1 font-serif text-xl font-bold">Reports</h2>
          <ReportList entries={own} showSummary />
        </>
      )}
      {joint.length > 0 && (
        <>
          <h2 className="mt-8 border-b border-rule pb-1 font-serif text-xl font-bold">Named as joint work</h2>
          <ReportList entries={joint} showSummary />
        </>
      )}
    </Container>
  );
}
