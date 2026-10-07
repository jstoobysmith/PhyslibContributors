import { Link } from 'react-router-dom';
import { Container, PageTitle } from '../components/ui';
import { useTitle } from '../site/useTitle';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <Container>
      <PageTitle title="Page not found" />
      <p>
        There is no page at this address. The link may be wrong, or the award may not have been published yet. Try the{' '}
        <Link to="/archive">list of awards</Link> or the <Link to="/">home page</Link>.
      </p>
    </Container>
  );
}
