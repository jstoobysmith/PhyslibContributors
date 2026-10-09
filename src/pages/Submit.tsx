import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buttonClass, Container, ErrorNote, Field, Input, inputClass, linkButtonClass, PageTitle } from '../components/ui';
import { EVIDENCE_KINDS, SECTIONS, SITE, SITE_URL, sectionById, TEST_SECTION, urls, type EvidenceKind, type Section } from '../lib/config';
import { prefillParams } from '../lib/prefill';
import { evidenceTitle, githubLoginFromInput, guessEvidenceKind, normaliseUrl, type Submission } from '../lib/submission';
import { download } from '../site/data';
import { ImportPullRequests } from '../components/ImportPullRequests';
import { SendAsIssue, SendWithFork } from '../components/SendOnGitHub';
import { openSubmissionPullRequest, submissionJson, whoAmI } from '../site/github';
import {
  chooseSection,
  emptyEvidence,
  prefillFromDraft,
  pullRequestKind,
  useSubmissionDraft,
  type Draft,
  type EvidenceDraft,
  type PersonDraft,
} from '../site/useSubmissionDraft';
import { useTitle } from '../site/useTitle';

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-4 first:border-t-0 first:pt-0">
      <h2 className="mb-3 font-serif text-xl font-bold">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A GitHub username, typed after a fixed "github.com/" so that it is clear only
 * the name goes in. "@octocat" or a pasted profile link becomes "octocat" when
 * the field is left.
 */
function GitHubUsernameField({
  label,
  value,
  onChange,
  error,
  withExample = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  withExample?: boolean;
}) {
  return (
    <Field
      label={label}
      error={error}
      hint={
        withExample && (
          <>
            Just the username, without “@”. For example, for <span className="font-mono">github.com/octocat</span> enter{' '}
            <span className="font-mono">octocat</span>.
          </>
        )
      }
    >
      <span className="flex">
        <span className="rounded-l-sm border border-r-0 border-[#aaa] bg-shade px-2 py-1.5 font-mono text-xs leading-5 text-muted" aria-hidden="true">
          github.com/
        </span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => value !== githubLoginFromInput(value) && onChange(githubLoginFromInput(value))}
          placeholder="octocat"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="rounded-l-none"
          data-invalid={!!error}
        />
      </span>
    </Field>
  );
}

function SectionOption({ section, checked, onChoose }: { section: Section; checked: boolean; onChoose: () => void }) {
  return (
    <label className="flex cursor-pointer gap-2">
      <input type="radio" name="section" value={section.id} checked={checked} onChange={onChoose} className="mt-1" />
      <span>
        <strong>
          {section.numeral}. {section.name}
        </strong>{' '}
        <span className="text-sm text-muted">— {section.summary}</span>
      </span>
    </label>
  );
}

/** A link that opens this form filled in as it is now, to send to someone (see src/lib/prefill.ts). */
function ShareLink({ draft }: { draft: Draft }) {
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const make = async () => {
    const url = `${SITE_URL}/submit?${prefillParams(prefillFromDraft(draft)).toString().replace(/%2C/g, ',')}`; // plain commas are easier to read
    setLink(url);
    setCopied(await navigator.clipboard?.writeText(url).then(() => true, () => false) ?? false);
  };
  return (
    <div className="panel">
      <div className="panel-title">Send this form to someone</div>
      <div className="space-y-2 px-3 py-2">
        <p className="text-xs text-muted">
          A link that opens this form already filled in, for example to start a submission for someone to check and
          send. Notes on links are not included.
        </p>
        <button type="button" onClick={make} className={buttonClass()}>
          Copy a link to this form
        </button>
        {link && (
          <>
            <p className="text-xs" role="status">
              {copied ? 'Copied.' : 'Copy this link:'}
            </p>
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Link to this form" className={`${inputClass} font-mono text-xs`} />
          </>
        )}
      </div>
    </div>
  );
}

function Preview({ d }: { d: Draft }) {
  const section = sectionById(d.section);
  const evidence = d.evidence.filter((e) => e.url || e.title);
  return (
    <div className="panel text-sm">
      <div className="panel-title">Preview</div>
      <div className="px-3 py-2">
        <p className="text-xs text-muted">{section && `${section.numeral}. ${section.name}`}</p>
        <p className="mt-1 font-serif text-base font-bold leading-snug">{d.title || <span className="font-normal text-muted">Title</span>}</p>
        <p>
          {d.name || <span className="text-muted">Contributor</span>}
          {d.collaborators.some((c) => c.name) && (
            <span className="text-muted"> (joint work with {d.collaborators.filter((c) => c.name).map((c) => c.name).join(', ')})</span>
          )}
        </p>
        <p className="mt-2 line-clamp-6 whitespace-pre-line font-serif text-muted">{d.summary || 'Summary.'}</p>
        {evidence.length > 0 && (
          <ol className="mt-2 space-y-0.5 text-xs text-muted">
            {evidence.map((e, i) => (
              <li key={i} className="truncate">
                [{i + 1}] {e.title || (e.url ? evidenceTitle({ url: e.url, kind: e.kind }) : '')}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default function Submit() {
  useTitle('Submit a contribution');
  const [params, setParams] = useSearchParams();
  const { draft, prefilled, set, update, errors, submission, slug, clear } = useSubmissionDraft(params);

  // A link that filled in the form: take its fields out of the address, so reloading keeps any edits.
  useEffect(() => {
    if (prefilled) setParams({}, { replace: true });
    // Once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [attempted, setAttempted] = useState(false);
  const [token, setToken] = useState('');
  const [progress, setProgress] = useState<string>();
  const [result, setResult] = useState<{ url?: string; error?: string }>();

  const err = (path: string) => (attempted ? errors[path] : undefined);
  // The submission must come from the contributor's own GitHub account.
  const senderInput = githubLoginFromInput(draft.github);
  const sender = senderInput && !errors['recipient.github'] ? senderInput : undefined;
  const section = sectionById(draft.section)!;
  // Imported pull requests are evidence of this kind: reviews in the Review section, pull requests elsewhere.
  const prKind = pullRequestKind(section.id);
  const setEvidence = (i: number, patch: Partial<EvidenceDraft>) =>
    update((d) => ({ ...d, evidence: d.evidence.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const setCollaborator = (i: number, patch: Partial<PersonDraft>) =>
    update((d) => ({ ...d, collaborators: d.collaborators.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const guard = (fn: (s: Submission) => void) => () => {
    setAttempted(true);
    if (submission) fn(submission);
    else setTimeout(() => document.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const submitWithToken = guard(async (s) => {
    setResult(undefined);
    try {
      setProgress('Checking the token');
      await whoAmI(token);
      setResult({ url: await openSubmissionPullRequest(token, slug, s, setProgress) });
    } catch (e) {
      setResult({ error: (e as Error).message });
    } finally {
      setProgress(undefined);
    }
  });

  const downloadJson = guard((s) => download(`${slug}.json`, submissionJson(s), 'application/json'));

  return (
    <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0">
        <PageTitle title="Submit a contribution">
          Describe your work and link to it. The submission becomes an
          issue on GitHub, where the maintainers check it; you need a free GitHub account. See{' '}
          <Link to="/about#process">how a report is made</Link>.
        </PageTitle>

        {prefilled && (
          <p className="mb-6 max-w-3xl border border-warning/40 bg-[#fdf8ec] px-3 py-2 text-sm">
            <strong>This form was filled in from the link you opened.</strong> Check every field, add anything missing, and send
            it in step 5. Nothing has been sent yet.
          </p>
        )}
        <form className="max-w-3xl space-y-8" onSubmit={(e) => e.preventDefault()} noValidate>
          <Step n={1} title="Section">
            <div className="space-y-2">
              {SECTIONS.map((s) => (
                <SectionOption key={s.id} section={s} checked={draft.section === s.id} onChoose={() => update((d) => chooseSection(d, s.id))} />
              ))}
              {TEST_SECTION && (
                <div className="mt-3 border-t border-dashed border-rule pt-3">
                  <SectionOption section={TEST_SECTION} checked={section.test === true} onChoose={() => update((d) => chooseSection(d, TEST_SECTION!.id))} />
                </div>
              )}
            </div>
            {section.test ? (
              <div className="mt-3 border border-warning/40 bg-[#fdf8ec] px-3 py-2 text-sm">
                <p className="font-bold">Test submission</p>
                <p className="mt-1">
                  The form is filled in with example data, except your GitHub username (and ORCID iD, which is optional). It needs
                  no approvals: once a maintainer accepts it, it is signed like a real report, but marked as a test, not numbered and
                  not listed with real reports.
                </p>
                <p className="mt-1 font-bold">Enter your GitHub username in step 2, then go to step 5 to send it.</p>
              </div>
            ) : (
              <div className="mt-3 border border-rule bg-shade px-3 py-2 text-sm">
                <p className="font-bold">The maintainers will check that:</p>
                <ol className="mt-1 ml-5 list-decimal space-y-0.5">
                  {section.criteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ol>
                {section.examples?.length ? (
                  <>
                    <p className="mt-2 font-bold">For example:</p>
                    <ul className="mt-1 ml-5 list-disc space-y-0.5">
                      {section.examples.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <p className="mt-2 text-muted">{section.guidance}</p>
              </div>
            )}
          </Step>

          <Step n={2} title="Who did the work">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={err('recipient.name')}>
                <Input value={draft.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" data-invalid={!!err('recipient.name')} />
              </Field>
              <GitHubUsernameField label="GitHub username" value={draft.github} onChange={(v) => set('github', v)} error={err('recipient.github')} />
              <Field label="ORCID iD (optional)" error={err('recipient.orcid')} hint="Shown on the report.">
                <Input value={draft.orcid} onChange={(e) => set('orcid', e.target.value)} placeholder="0000-0002-1825-0097" data-invalid={!!err('recipient.orcid')} />
              </Field>
            </div>

            <div className="mt-4">
              <p className="text-sm font-bold">Joint work (optional)</p>
              <p className="text-xs text-muted">
                If others did this work with the contributor, name them here. They are shown on the report as joint work; each can
                also submit a report of their own.
              </p>
              {draft.collaborators.map((c, i) => (
                <div key={i} className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label="Name" error={err(`collaborators.${i}.name`)}>
                    <Input value={c.name} onChange={(e) => setCollaborator(i, { name: e.target.value })} />
                  </Field>
                  <GitHubUsernameField
                    label="GitHub username"
                    value={c.github}
                    onChange={(v) => setCollaborator(i, { github: v })}
                    error={err(`collaborators.${i}.github`)}
                    withExample={false}
                  />
                  <button type="button" className="mb-1.5 text-sm text-link hover:underline" onClick={() => update((d) => ({ ...d, collaborators: d.collaborators.filter((_, j) => j !== i) }))}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className={`${buttonClass()} mt-2`} onClick={() => update((d) => ({ ...d, collaborators: [...d.collaborators, { name: '', github: '' }] }))}>
                Add a person
              </button>
            </div>
          </Step>

          <Step n={3} title="The work">
            <div className="space-y-4">
              <Field label="Title" error={err('title')} hint={`One line, as for a paper, e.g. “${section.examples?.[0] ?? 'Reviews of the tensor species refactor'}”.`}>
                <Input value={draft.title} onChange={(e) => set('title', e.target.value)} data-invalid={!!err('title')} />
              </Field>
              <Field label="Summary" error={err('summary')} hint="What was done and why it mattered to Physlib, in a few sentences. Separate paragraphs with a blank line.">
                <textarea value={draft.summary} onChange={(e) => set('summary', e.target.value)} rows={6} className={`${inputClass} font-serif text-base`} data-invalid={!!err('summary')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From (optional)" error={err('period.from')}>
                  <Input type="month" value={draft.from} onChange={(e) => set('from', e.target.value)} />
                </Field>
                <Field label="To (optional)" error={err('period.to')}>
                  <Input type="month" value={draft.to} onChange={(e) => set('to', e.target.value)} />
                </Field>
              </div>
            </div>
          </Step>

          <Step n={4} title="Evidence">
            <p className="mb-3 text-sm text-muted">
              Links to the pull requests, reviews, commits, modules or Zulip threads that make up the work. One report can cover
              many links.
            </p>
            <ImportPullRequests
              kind={prKind}
              existingUrls={draft.evidence.map((e) => e.url)}
              onAdd={(urls) =>
                update((d) => ({
                  ...d,
                  // Imported links replace the empty row the form starts with.
                  evidence: [
                    ...d.evidence.filter((e) => e.url.trim() || e.title.trim()),
                    ...urls.map((url) => ({ ...emptyEvidence(prKind), url, kindChosen: true })),
                  ],
                }))
              }
            />
            {err('evidence') && <p className="mb-2 text-xs text-danger">{err('evidence')}</p>}
            <ol className="space-y-3">
              {draft.evidence.map((e, i) => (
                <li key={i} className="border border-rule p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-bold">[{i + 1}]</span>
                    {draft.evidence.length > 1 && (
                      <button type="button" onClick={() => set('evidence', draft.evidence.filter((_, j) => j !== i))} className="text-link hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                    <Field label="Link" error={err(`evidence.${i}.url`)}>
                      <Input
                        type="url"
                        value={e.url}
                        onChange={(ev) => {
                          const url = ev.target.value;
                          setEvidence(i, { url, ...(e.kindChosen ? {} : { kind: guessEvidenceKind(normaliseUrl(url), section.evidenceKinds[0]) }) });
                        }}
                        onBlur={() => setEvidence(i, { url: normaliseUrl(e.url) })}
                        placeholder={`https://github.com/${SITE.physlib.repository}/pull/123`}
                        data-invalid={!!err(`evidence.${i}.url`)}
                      />
                    </Field>
                    <Field label="Kind">
                      <select value={e.kind} onChange={(ev) => setEvidence(i, { kind: ev.target.value as EvidenceKind, kindChosen: true })} className={inputClass}>
                        {Object.entries(EVIDENCE_KINDS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Note (optional)" error={err(`evidence.${i}.description`)}>
                        <Input value={e.description} onChange={(ev) => setEvidence(i, { description: ev.target.value })} />
                      </Field>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => set('evidence', [...draft.evidence, emptyEvidence(section.evidenceKinds[0])])} className={`${buttonClass()} mt-3`}>
              Add another link
            </button>
          </Step>

          <Step n={5} title="Send">
            {attempted && !submission && (
              <div className="mb-3">
                <ErrorNote>Some fields need attention; they are marked above.</ErrorNote>
              </div>
            )}
            <SendAsIssue sender={sender} guard={guard} />

            <details className="mt-5 text-sm">
              <summary className="cursor-pointer text-link">Other ways to send it (as a pull request)</summary>
              <div className="mt-3 space-y-4 border-l-2 border-rule pl-4">
                <div>
                  <p className="font-bold">As a pull request from a fork</p>
                  <p className="mt-1 mb-2 text-muted">For people who prefer pull requests. The maintainers review it there instead.</p>
                  <SendWithFork
                    sender={sender}
                    slug={slug}
                    submission={submission}
                    guard={guard}
                    onDownload={downloadJson}
                  />
                </div>
                <div>
                  <p className="font-bold">Open the pull request from this page</p>
                  <p className="mt-1 text-muted">
                    Needs a GitHub <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=Physlib%20Contributions">personal access token</a>{' '}
                    with the <code className="font-mono">public_repo</code> scope. The token is used once, sent only to GitHub, and
                    not stored. Delete it on GitHub afterwards.
                  </p>
                  <div className="mt-2 flex max-w-lg gap-2">
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="ghp_…"
                      aria-label="GitHub personal access token"
                      autoComplete="off"
                      className={`${inputClass} font-mono text-xs`}
                    />
                    <button type="button" onClick={submitWithToken} disabled={!token || !!progress} className={`${buttonClass()} shrink-0`}>
                      {progress ? `${progress}…` : 'Open pull request'}
                    </button>
                  </div>
                </div>
                <p>
                  Or{' '}
                  <button type="button" className={linkButtonClass} onClick={downloadJson}>
                    download the file
                  </button>{' '}
                  and add it to <code className="font-mono text-xs">submissions/</code> in a pull request to{' '}
                  <a href={urls.repo()}>
                    {SITE.repository.owner}/{SITE.repository.name}
                  </a>{' '}
                  yourself.
                </p>
              </div>
            </details>

            {result?.url && (
              <div className="mt-4 border border-success/40 bg-[#f1f8f3] px-3 py-2 text-sm">
                <p className="font-bold">Your pull request is open:</p>
                <a href={result.url} className="break-all">
                  {result.url}
                </a>
              </div>
            )}
            {result?.error && (
              <div className="mt-4">
                <ErrorNote>{result.error}</ErrorNote>
              </div>
            )}
          </Step>
        </form>
      </div>

      <aside className="min-w-0 space-y-4 text-sm lg:sticky lg:top-4 lg:self-start">
        <Preview d={draft} />
        <div className="panel">
          <div className="panel-title">What happens next</div>
          <ol className="ml-8 list-decimal space-y-1 py-2 pr-3">
            <li>An automatic check reads the submission and posts a summary on its issue.</li>
            <li>The maintainers check the evidence there and may ask questions.</li>
            <li>When it is accepted, the report is signed and appears on this site.</li>
          </ol>
          <p className="border-t border-rule px-3 py-2 text-xs text-muted">
            Maintainers review as volunteers, so there is no fixed turnaround. Submitting is optional: plenty of good work is
            never submitted.
          </p>
        </div>
        <ShareLink draft={draft} />
        <p>
          <button type="button" className={linkButtonClass} onClick={() => (clear(), setAttempted(false))}>
            Clear the form
          </button>
        </p>
      </aside>
    </Container>
  );
}
