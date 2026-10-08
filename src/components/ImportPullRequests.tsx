import { useState } from 'react';
import { EVIDENCE_KINDS, SITE, type EvidenceKind } from '../lib/config';
import { canonicalUrl, parsePullRequestList, pullRequestEvidenceTitle, pullRequestUrl } from '../lib/submission';
import { pullRequestTitles, TITLE_LOOKUPS } from '../site/github';
import { buttonClass, inputClass } from './ui';

const prUrl = (n: number) => pullRequestUrl(SITE.physlib.repository, n);

/**
 * Adds many pull requests to the evidence at once: the contributor pastes
 * numbers or links, separated by commas, and each becomes an evidence link,
 * titled with the pull request's own title where GitHub can be asked.
 */
export function ImportPullRequests({
  kind,
  existingUrls,
  onAdd,
  onLookedUp,
}: {
  /** The kind given to imported links (the section's usual one: "Pull request review" in Review). */
  kind: EvidenceKind;
  existingUrls: string[];
  onAdd: (urls: string[]) => void;
  /**
   * What GitHub said about each link afterwards: its title (given to links still
   * without one), or null for a pull request that does not exist (removed again).
   */
  onLookedUp: (titles: Map<string, string | null>) => void;
}) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const { numbers, invalid } = parsePullRequestList(text, SITE.physlib.repository);
    const listed = new Set(existingUrls.map(canonicalUrl));
    const fresh = numbers.filter((n) => !listed.has(canonicalUrl(prUrl(n))));
    const already = numbers.filter((n) => !fresh.includes(n));
    const notes = [
      fresh.length ? `Added ${fresh.length} pull request${fresh.length === 1 ? '' : 's'}.` : 'Nothing new to add.',
      already.length ? `Already listed: ${already.map((n) => `#${n}`).join(', ')}.` : '',
      invalid.length ? `Not recognised: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? ', …' : ''} (use numbers, or links to ${SITE.physlib.repository} pull requests).` : '',
    ].filter(Boolean);
    setMessage(notes.join(' '));
    if (!fresh.length) return;
    onAdd(fresh.map(prUrl));
    setText(invalid.join(', '));

    // Then the titles, which make the list readable for the maintainers and on the report.
    setBusy(true);
    const { titles, complete } = await pullRequestTitles(fresh);
    setBusy(false);
    onLookedUp(new Map([...titles].map(([n, title]) => [prUrl(n), title && pullRequestEvidenceTitle(n, title, kind)])));
    const missing = [...titles].filter(([, t]) => t === null).map(([n]) => `#${n}`);
    if (missing.length) {
      notes[0] = `Added ${fresh.length - missing.length} pull request${fresh.length - missing.length === 1 ? '' : 's'}.`;
      notes.push(`Not added, as ${SITE.physlib.repository} has no pull request ${missing.join(', ')}.`);
    }
    if (!complete) {
      notes.push(
        fresh.length > TITLE_LOOKUPS
          ? `Titles were looked up for the first ${TITLE_LOOKUPS}; the rest are added without one.`
          : 'Some titles could not be looked up just now; those links are added without one.',
      );
    }
    setMessage(notes.join(' '));
  };

  return (
    <div className="mb-4 border border-rule bg-shade px-3 py-2 text-sm">
      <label htmlFor="import-prs" className="font-bold">
        Import pull requests
      </label>
      <p className="text-xs text-muted">
        Numbers or links of pull requests to {SITE.physlib.repository}, separated by commas, e.g. <span className="font-mono">412, 418, #430</span>.
        Each is added below as a “{EVIDENCE_KINDS[kind]}”, with its title.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          id="import-prs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="412, 418, #430"
          className={inputClass}
        />
        <button type="button" onClick={add} disabled={!text.trim() || busy} className={`${buttonClass()} shrink-0`}>
          {busy ? 'Looking up titles…' : 'Add'}
        </button>
      </div>
      {message && (
        <p className="mt-1 text-xs" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
