import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import './index.css';
import Layout from './components/Layout';
import Home from './pages/Home';
import About from './pages/About';
import { SectionPage, SectionsIndex } from './pages/Sections';
import Archive from './pages/Archive';
import Report from './pages/Report';
import Contributor from './pages/Contributor';
import Verify from './pages/Verify';
import NotFound from './pages/NotFound';
import { Container, Spinner } from './components/ui';

// The submission form carries the validation library; load it only when needed.
const Submit = lazy(() => import('./pages/Submit'));

function RedirectToReport() {
  const { slug } = useParams();
  return <Navigate to={`/reports/${slug}`} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="sections" element={<SectionsIndex />} />
          <Route path="sections/:id" element={<SectionPage />} />
          <Route path="archive" element={<Archive />} />
          <Route path="reports/:slug" element={<Report />} />
          {/* Earlier address of report pages. */}
          <Route path="awards/:slug" element={<RedirectToReport />} />
          <Route path="contributors/:login" element={<Contributor />} />
          <Route
            path="submit"
            element={
              <Suspense fallback={<Container className="py-24"><Spinner /></Container>}>
                <Submit />
              </Suspense>
            }
          />
          <Route path="verify" element={<Verify />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
