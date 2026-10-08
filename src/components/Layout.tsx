import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SECTIONS, SITE, urls } from '../lib/config';
import { asset } from '../site/data';
import { Container } from './ui';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/sections', label: 'Sections' },
  { to: '/archive', label: 'All reports' },
  { to: '/submit', label: 'Submit' },
  { to: '/verify', label: 'Verify' },
  { to: '/about', label: 'About' },
];

function SearchBox() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/archive?q=${encodeURIComponent(q.trim())}` : '/archive');
  };
  return (
    <form onSubmit={submit} role="search" className="flex items-center gap-1">
      <label htmlFor="site-search" className="sr-only">
        Search reports
      </label>
      <input
        id="site-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search titles, names…"
        className="w-44 rounded-sm border border-white/40 bg-white px-2 py-1 text-sm text-foreground sm:w-56"
      />
      <button type="submit" className="rounded-sm border border-white/60 px-2 py-1 text-sm text-white hover:bg-white/10">
        Search
      </button>
    </form>
  );
}

function Header() {
  return (
    <header>
      <div className="border-b border-rule bg-white">
        <Container className="flex items-center justify-between gap-4 py-1.5 text-xs text-muted">
          <span>Reports on contributions to Physlib, reviewed and published openly on GitHub.</span>
          <a href={SITE.physlib.site} className="shrink-0" aria-label="Physlib">
            <img src={asset('images/physlib-logo.png')} alt="Physlib" width={1600} height={459} className="h-5 w-auto" />
          </a>
        </Container>
      </div>
      <div className="bg-band text-white">
        <Container className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 py-3">
          <Link to="/" className="text-white hover:no-underline">
            <span className="block font-serif text-[1.75rem] leading-none">
              {SITE.title}
              <BetaTag />
            </span>
            <span className="mt-1 block text-xs text-white/80">{SECTIONS.map((s) => s.name).join(' · ')}</span>
          </Link>
          <SearchBox />
        </Container>
      </div>
      <nav className="border-b border-rule bg-shade" aria-label="Main">
        <Container className="flex flex-wrap gap-x-5 gap-y-1 py-1.5 text-sm">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'font-bold text-foreground' : '')}>
              {n.label}
            </NavLink>
          ))}
        </Container>
      </nav>
    </header>
  );
}

function Footer() {
  const link = (label: string, to: string) =>
    /^https?:/.test(to) || to.endsWith('.json') ? <a href={to}>{label}</a> : <Link to={to}>{label}</Link>;
  return (
    <footer className="mt-16 border-t border-rule bg-shade">
      <Container className="grid gap-6 py-6 text-sm sm:grid-cols-3">
        <ul className="space-y-1">
          <li>{link('About', '/about')}</li>
          <li>{link('Who reviews reports', '/about#maintainers')}</li>
          <li>{link('Submit a contribution', '/submit')}</li>
        </ul>
        <ul className="space-y-1">
          <li>{link('Verify a report', '/verify')}</li>
          <li>{link('Public signing key', '/verify#key')}</li>
          <li>{link('Site status', '/status')}</li>
          <li>{link('This site on GitHub', urls.repo())}</li>
        </ul>
        <ul className="space-y-1">
          <li>{link('Physlib', SITE.physlib.site)}</li>
          <li>{link('Physlib on GitHub', urls.physlibRepo())}</li>
          <li>{link('Physlib on Zulip', SITE.physlib.zulip)}</li>
        </ul>
      </Container>
      <Container className="border-t border-rule py-3 text-xs text-muted">
        Reports are digitally signed, so anyone can check that they are genuine. <Link to="/verify">How to check a report</Link>.
        {SITE.beta && <> This site is in beta: its look and process may still change, but reports are signed and permanent.</>}
      </Container>
    </footer>
  );
}

/** A small "Beta" tag beside the site's name while config/site.json has "beta": true. */
function BetaTag() {
  if (!SITE.beta) return null;
  return (
    <span
      className="ml-2.5 inline-block rounded-sm border border-white/60 px-1.5 py-0.5 align-[0.35em] font-sans text-[0.65rem] font-bold uppercase leading-none tracking-wider text-white/90"
      title="This site is new, and its look and process may still change. Reports are signed and permanent."
    >
      Beta
    </span>
  );
}

export default function Layout() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:px-2 focus:py-1">
        Skip to content
      </a>
      <Header />
      <main id="main" className="min-w-0 flex-1 pt-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
