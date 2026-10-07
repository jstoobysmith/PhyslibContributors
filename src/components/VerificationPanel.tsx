import { useEffect, useState } from 'react';
import type { JsonObject } from '../lib/dataIntegrity';
import type { Check, VerificationResult } from '../lib/verify';
import { SITE, SPECIMEN_SLUG, urls } from '../lib/config';
import { verifyInBrowser } from '../site/data';

const MARK: Record<Check['status'], { mark: string; cls: string }> = {
  pass: { mark: '✓', cls: 'text-success' },
  fail: { mark: '✗', cls: 'text-danger' },
  warn: { mark: '!', cls: 'text-warning' },
  info: { mark: '–', cls: 'text-muted' },
};

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul>
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2 py-1">
          <span className={`w-3 shrink-0 font-bold ${MARK[c.status].cls}`} aria-hidden="true">
            {MARK[c.status].mark}
          </span>
          <span className="min-w-0">
            {c.label}
            <span className="block break-words text-xs text-muted">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Verifies a credential in the browser: one clear result, with the individual checks folded away. */
export default function VerificationPanel({
  credential,
  onResult,
}: {
  credential: JsonObject;
  /** Called with whether the credential verified. */
  onResult?: (valid: boolean) => void;
}) {
  const [result, setResult] = useState<VerificationResult | { error: string }>();

  useEffect(() => {
    let live = true;
    setResult(undefined);
    verifyInBrowser(credential).then(
      (r) => {
        if (!live) return;
        setResult(r);
        onResult?.(r.valid);
      },
      (e: Error) => {
        if (!live) return;
        setResult({ error: e.message });
        onResult?.(false);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credential]);

  const failure = result && ('error' in result ? result.error : result.checks.find((c) => c.status === 'fail')?.detail);
  const specimen = credential.id === urls.credential(SPECIMEN_SLUG);
  return (
    <div className={`panel text-sm ${failure ? 'border-danger' : ''}`}>
      <div className="panel-title">Verification</div>
      <div className="px-3 py-2" role="status" aria-live="polite">
        {!result && <p className="text-muted">Checking the signature…</p>}
        {result && !failure && (
          <>
            <p className="font-bold text-success">✓ Genuine</p>
            <p className="mt-1">Issued by {SITE.issuer.name} and unchanged since it was signed.</p>
            {specimen && <p className="mt-1 font-bold text-warning">This is the specimen: a sample, not a real award.</p>}
          </>
        )}
        {failure && (
          <>
            <p className="font-bold text-danger">✗ Not verified</p>
            <p className="mt-1 text-danger">{failure}</p>
          </>
        )}
        {result && 'checks' in result && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-link">Show the checks</summary>
            <div className="mt-1">
              <CheckList checks={result.checks} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
