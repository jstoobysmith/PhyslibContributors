import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SITE } from '../lib/config';
import type { Submission } from '../lib/submission';
import {
  changedInFork,
  findFork,
  forkUrl,
  newFileUrl,
  openPullRequestFrom,
  pullRequestUrl,
  submissionPath,
  uploadUrl,
  type Fork,
} from '../site/github';
import { buttonClass, linkButtonClass } from './ui';

/** Links longer than this may be cut short on the way to GitHub, leaving the new file empty. */
const LONG_URL = 8000;

type Progress =
  | { status: 'idle' | 'checking' | 'none' }
  | { status: 'error'; message: string }
  | { status: 'found'; fork: Fork; changed: string[]; pullRequest?: string };

/**
 * How far the sender has got: whether they have a fork, what it contains,
 * and whether a pull request from it is open. Checked when the username is
 * entered and again whenever the page regains focus (on returning from GitHub).
 */
function useForkProgress(sender: string | undefined) {
  const [progress, setProgress] = useState<Progress>({ status: 'idle' });
  const known = useRef<{ sender: string; fork: Fork }>(undefined);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (!sender) return setProgress({ status: 'idle' });
    lastCheck.current = Date.now();
    setProgress((p) => (p.status === 'found' ? p : { status: 'checking' }));
    try {
      const fork = known.current?.sender === sender ? known.current.fork : await findFork(sender);
      if (!fork) return setProgress({ status: 'none' });
      known.current = { sender, fork };
      const [changed, pullRequest] = await Promise.all([changedInFork(fork), openPullRequestFrom(fork)]);
      setProgress({ status: 'found', fork, changed, pullRequest });
    } catch (e) {
      setProgress({ status: 'error', message: (e as Error).message });
    }
  }, [sender]);

  useEffect(() => {
    const t = setTimeout(check, 600); // once the username has been typed
    const onFocus = () => Date.now() - lastCheck.current > 3000 && check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  return { progress, check };
}

function Task({ letter, title, done, children }: { letter: string; title: string; done?: boolean; children: ReactNode }) {
  return (
    <li className="border border-rule">
      <div className="flex items-baseline justify-between gap-2 border-b border-rule bg-shade px-3 py-1.5">
        <span className="font-bold">
          {letter}. {title}
        </span>
        {done && <span className="shrink-0 text-xs font-bold whitespace-nowrap text-success">✓ Done</span>}
      </div>
      <div className="space-y-2 px-3 py-2">{children}</div>
    </li>
  );
}

function Status({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'success' | 'warning' }) {
  const color = { muted: 'text-muted', success: 'text-success', warning: 'text-warning' }[tone];
  return (
    <p className={`text-xs ${color}`} role="status">
      {children}
    </p>
  );
}

const Button = ({ onClick, primary, children }: { onClick: () => void; primary?: boolean; children: ReactNode }) => (
  <button type="button" onClick={onClick} className={buttonClass(primary ? 'primary' : 'plain')}>
    {children}
  </button>
);

const open = (url: string) => window.open(url, '_blank', 'noopener');

/**
 * Step 5 of the form, the usual way to send a submission: fork the reports
 * repository, add the file to the fork, open a pull request. GitHub does each
 * step in another tab; this panel says what to click and shows what is done.
 */
export function SendOnGitHub({
  sender,
  senderRole,
  slug,
  submission,
  guard,
  onDownload,
}: {
  /** The GitHub account the pull request must come from (the recipient or the nominator), once valid. */
  sender: string | undefined;
  senderRole: 'contributor' | 'nominator';
  slug: string;
  /** The submission, once the form is valid. */
  submission: Submission | undefined;
  /** Runs the action with the submission if the form is valid; otherwise points to the problems. */
  guard: (fn: (s: Submission) => void) => () => void;
  onDownload: () => void;
}) {
  const { owner, name } = SITE.repository;
  // The owner of the reports repository can add the file there directly.
  const direct = sender?.toLowerCase() === owner.toLowerCase();
  const { progress, check } = useForkProgress(direct ? undefined : sender);
  const checkLink = (label = 'Check again') => (
    <button type="button" className={linkButtonClass} onClick={check}>
      {label}
    </button>
  );
  const checkAgain = checkLink();

  if (!sender) {
    return (
      <p className="text-sm">
        Enter {senderRole === 'nominator' ? 'your' : 'the contributor’s'} GitHub username in step 2 first: the submission is sent from
        that account.
      </p>
    );
  }

  const intro = (
    <p className="text-sm">
      The submission is sent as a pull request (a proposed change) on GitHub, from the account of{' '}
      {senderRole === 'nominator' ? 'the person nominating' : 'the contributor'}: <strong>@{sender}</strong>.{' '}
      <a href="https://github.com/login">Sign in to GitHub</a> as @{sender} before you start. Each step opens GitHub in a new tab;
      come back here after each one.
    </p>
  );

  if (direct) {
    return (
      <div className="space-y-3">
        {intro}
        <ol className="space-y-3 text-sm">
          <Task letter="A" title="Add the submission and open the pull request">
            <Button primary onClick={guard((s) => open(newFileUrl(slug, s)))}>
              Continue on GitHub
            </Button>
            <p>
              Click <em>Commit changes…</em>, choose <em>Create a new branch for this commit and start a pull request</em>, click{' '}
              <em>Propose changes</em>, then <em>Create pull request</em>.
            </p>
          </Task>
        </ol>
      </div>
    );
  }

  const fork = progress.status === 'found' ? progress.fork : undefined;
  // Before the fork is found, assume it has the usual name.
  const target: Fork = fork ?? { owner: sender, name, fullName: `${sender}/${name}` };
  const changed = progress.status === 'found' ? progress.changed : [];
  const added = !!slug && changed.includes(submissionPath(slug));
  const others = changed.filter((f) => f !== submissionPath(slug));
  const openPull = progress.status === 'found' ? progress.pullRequest : undefined;
  // An open pull request from the fork is this submission's only if the fork holds this submission.
  const pullRequest = added ? openPull : undefined;
  const busy = !added && openPull;
  const stale = others.length > 0 && !openPull;

  return (
    <div className="space-y-3">
      {intro}
      <ol className="space-y-3 text-sm">
        <Task letter="A" title="Make your own copy of the repository (a “fork”)" done={!!fork && !busy && !stale}>
          <p>
            GitHub only lets people propose changes to a project from their own copy of it, called a fork. You make the fork once
            and can use it for every later submission.
          </p>
          {!fork && (
            <>
              <Button primary onClick={() => open(forkUrl())}>
                Fork on GitHub
              </Button>
              <p>
                On the page that opens, check that <em>Owner</em> is @{sender}, leave everything else as it is, and click{' '}
                <em>Create fork</em>. Then come back to this page.
              </p>
            </>
          )}
          {progress.status === 'checking' && <Status>Checking GitHub…</Status>}
          {progress.status === 'none' && <Status>No fork found for @{sender} yet. {checkAgain}</Status>}
          {progress.status === 'error' && (
            <Status tone="warning">
              Could not check ({progress.message}). If you have made the fork, carry on with B. {checkAgain}
            </Status>
          )}
          {fork && (
            <Status tone="success">
              Found your fork: <a href={`https://github.com/${fork.fullName}`}>{fork.fullName}</a>.
            </Status>
          )}
          {busy && (
            <div className="border border-warning/40 bg-[#fdf8ec] px-3 py-2 text-xs">
              <p>
                An earlier submission from your fork is still open as <a href={busy}>a pull request</a>. Anything added to your
                fork now would join that pull request. Wait until it has been merged or closed, or send this submission another
                way (below).
              </p>
            </div>
          )}
          {fork && stale && (
            <div className="border border-warning/40 bg-[#fdf8ec] px-3 py-2 text-xs">
              <p>
                Your fork has older changes that are not in {owner}/{name} ({others.slice(0, 3).join(', ')}
                {others.length > 3 && ', …'}). A new pull request would repeat them. On{' '}
                <a href={`https://github.com/${fork.fullName}`}>your fork</a>, click <em>Sync fork</em>, then{' '}
                <em>Discard commits</em> (or <em>Update branch</em> if that is the only choice). Then {checkLink('check again')}.
              </p>
            </div>
          )}
          {!fork && (
            <details className="text-xs">
              <summary className="cursor-pointer text-link">The fork does not work?</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>GitHub shows “404” or asks you to sign in:</strong> <a href="https://github.com/login">sign in</a>, then
                  click <em>Fork on GitHub</em> again.
                </li>
                <li>
                  <strong>GitHub says you already have a fork, or <em>Create fork</em> cannot be clicked:</strong> you probably
                  have one already. Click {checkAgain}. If it is under another account, sign in as @{sender} and fork again.
                </li>
                <li>
                  <strong>Your account belongs to your employer or university</strong> (a “managed” account): such accounts
                  cannot fork public projects. Use a personal GitHub account, and enter that username in step 2.
                </li>
                <li>
                  <strong>Still stuck?</strong> Use one of the other ways to send it, below, or ask on the{' '}
                  <a href={SITE.physlib.zulip}>Physlib Zulip</a>.
                </li>
              </ul>
            </details>
          )}
        </Task>

        <Task letter="B" title="Add the submission to your fork" done={added}>
          <Button primary={!!fork && !added} onClick={guard((s) => open(newFileUrl(slug, s, target.fullName)))}>
            Add the file on GitHub
          </Button>
          <p>
            GitHub opens a new file in your fork, already filled in. Click <em>Commit changes…</em>, keep{' '}
            <em>Commit directly to the main branch</em>, and click <em>Commit changes</em>.
          </p>
          {submission && newFileUrl(slug, submission, target.fullName).length > LONG_URL && (
            <p className="text-xs text-warning">
              This submission is long, and GitHub may open an empty file. If it does,{' '}
              <button type="button" className={linkButtonClass} onClick={onDownload}>
                download the file
              </button>{' '}
              and drag it onto <a href={uploadUrl(target.fullName)}>GitHub’s upload page</a> instead.
            </p>
          )}
          {added && <Status tone="success">The submission is in your fork.</Status>}
          {fork && !added && <Status>Not in your fork yet. {checkAgain}</Status>}
        </Task>

        <Task letter="C" title="Open the pull request" done={!!pullRequest}>
          {pullRequest ? (
            <Status tone="success">
              Your pull request is open: <a href={pullRequest}>{pullRequest}</a>. An automatic check will post a summary on it,
              and the maintainers will review it there.
            </Status>
          ) : (
            <>
              <Button primary={added} onClick={guard((s) => open(pullRequestUrl(target, s)))}>
                Open the pull request
              </Button>
              <p>
                Check that the page lists one file, <span className="font-mono text-xs">{submissionPath(slug || '…')}</span>, and
                click <em>Create pull request</em>.
              </p>
            </>
          )}
        </Task>
      </ol>
    </div>
  );
}
