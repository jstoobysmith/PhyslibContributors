import { Container, PageTitle, Spinner } from '../components/ui';
import { urls } from '../lib/config';
import { countOutcomes, OUTCOMES, type CheckResult, type Outcome, type SetupStatus } from '../lib/setup-status';
import { asset, fetchJson, formatDate, useAsync } from '../site/data';
import { useTitle } from '../site/useTitle';

const STYLE: Record<Outcome, { mark: string; label: string; plural: string; className: string }> = {
  pass: { mark: '✓', label: 'Passed', plural: 'passed', className: 'text-success' },
  warn: { mark: '!', label: 'Warning', plural: 'warnings', className: 'text-warning' },
  fail: { mark: '✗', label: 'Failed', plural: 'failed', className: 'text-danger' },
  skip: { mark: '–', label: 'Skipped', plural: 'skipped', className: 'text-muted' },
};

const runWorkflowUrl = () => `${urls.repo()}/actions/workflows/setup-check.yml`;

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 120) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function Mark({ outcome }: { outcome: Outcome }) {
  const s = STYLE[outcome];
  return (
    <span className={`inline-block w-4 shrink-0 text-center font-bold ${s.className}`} title={s.label}>
      <span aria-hidden="true">{s.mark}</span>
      <span className="sr-only">{s.label}:</span>
    </span>
  );
}

function CheckLine({ r }: { r: CheckResult }) {
  return (
    <li className="flex gap-2 py-1.5">
      <Mark outcome={r.outcome} />
      {/* Details often contain long links and keys: let them wrap anywhere. */}
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <span className="font-bold">
          {r.id} {r.name}
        </span>
        <span className={r.outcome === 'skip' ? 'text-muted' : ''}>: {r.detail}</span>
        {r.fix && r.outcome !== 'pass' && (
          <p className="mt-0.5 text-muted">
            <span className={`font-bold ${STYLE[r.outcome].className}`}>Fix:</span> {r.fix}
          </p>
        )}
      </div>
    </li>
  );
}

/** Overall verdict, as in the workflow's own summary. */
function Verdict({ status }: { status: SetupStatus }) {
  const counts = countOutcomes(status.parts.flatMap((p) => p.results));
  const [tone, text] = counts.fail
    ? (['border-danger/40 bg-[#fdf3f2] text-danger', `Not ready: ${counts.fail} ${counts.fail === 1 ? 'check fails' : 'checks fail'}`] as const)
    : counts.warn
      ? (['border-warning/40 bg-[#fdf8ec]', `Working, with ${counts.warn} ${counts.warn === 1 ? 'warning' : 'warnings'}`] as const)
      : (['border-success/40 bg-[#f1f8f3] text-success', 'Everything is working'] as const);
  return (
    <div className={`border px-3 py-2 ${tone}`}>
      <p className="font-serif text-lg font-bold">{text}</p>
      <p className="text-sm text-foreground">
        Checked {formatDate(status.checkedAt, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC (
        {ago(status.checkedAt)})
        {status.commit && (
          <>
            {' '}
            on commit <a href={`${urls.repo()}/commit/${status.commit}`} className="font-mono text-xs">{status.commit.slice(0, 7)}</a>
          </>
        )}
        {status.runUrl && (
          <>
            {' '}
            · <a href={status.runUrl}>full log on GitHub</a>
          </>
        )}
        .
      </p>
    </div>
  );
}

export default function Status() {
  useTitle('Site status');
  const status = useAsync(() => fetchJson<SetupStatus>(asset('data/status.json')), []);

  return (
    <Container className="max-w-4xl">
      <PageTitle title="Site status">
        The results of the setup check, which tests everything this site depends on: its configuration, the signing key, the
        settings of its GitHub repository, the submissions and signed reports, a trial run of a made-up submission, and the
        live site. Maintainers can <a href={runWorkflowUrl()}>run the check again</a> from GitHub; this page is updated a few
        minutes later.
      </PageTitle>

      {status.status === 'loading' && <Spinner />}
      {status.status === 'error' && (
        <p>
          No results yet. They appear here after the <a href={runWorkflowUrl()}>Setup check workflow</a> has run.
        </p>
      )}
      {status.status === 'ready' && (
        <div className="space-y-8">
          <Verdict status={status.data} />

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="py-1 pr-2 font-bold">Part</th>
                {OUTCOMES.map((o) => (
                  <th key={o} className="py-1 pl-3 text-right font-bold whitespace-nowrap sm:w-28">
                    <span className={STYLE[o].className} aria-hidden="true">
                      {STYLE[o].mark}
                    </span>{' '}
                    <span className="sr-only sm:not-sr-only">{STYLE[o].plural}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {status.data.parts.map((p) => {
                const c = countOutcomes(p.results);
                return (
                  <tr key={p.number} className="border-b border-rule/60">
                    <td className="py-1 pr-2">
                      <a href={`#part-${p.number}`}>
                        {p.number}. {p.title}
                      </a>
                    </td>
                    {OUTCOMES.map((o) => (
                      <td key={o} className={`py-1 text-right tabular-nums ${c[o] ? STYLE[o].className : 'text-muted'}`}>
                        {c[o]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {status.data.parts.map((p) => (
            <section key={p.number} id={`part-${p.number}`} className="scroll-mt-4">
              <h2 className="border-b border-rule pb-1 font-serif text-xl font-bold">
                {p.number}. {p.title}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {p.covers} Code: <a href={`${urls.repo()}/blob/${status.data.commit ?? 'main'}/${p.file}`} className="font-mono text-xs">{p.file}</a>
              </p>
              <ul className="mt-1 text-sm">
                {p.results.map((r) => (
                  <CheckLine key={r.id} r={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}
