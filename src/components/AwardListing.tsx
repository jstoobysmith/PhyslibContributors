import { Link } from 'react-router-dom';
import { sectionById } from '../lib/config';
import type { AwardEntry } from '../lib/awards';
import { formatDate } from '../site/data';

/** One award in a list, in the style of an arXiv listing. */
export function AwardListItem({ entry, showSummary = false }: { entry: AwardEntry; showSummary?: boolean }) {
  const section = sectionById(entry.section);
  return (
    <li className="border-b border-rule py-3 last:border-b-0">
      <p className="text-sm text-muted">
        Award no. {entry.number} · {section ? `${section.numeral}. ${section.name}` : entry.section} · accepted {formatDate(entry.acceptedAt)}
        {entry.revoked && <span className="ml-2 font-bold text-danger">Revoked</span>}
      </p>
      <p className="mt-0.5 font-serif text-[1.125rem] leading-snug">
        <Link to={`/awards/${entry.slug}`} className="text-foreground">
          {entry.title}
        </Link>
      </p>
      <p className="text-sm">
        {entry.recipient.github ? <Link to={`/contributors/${entry.recipient.github}`}>{entry.recipient.name}</Link> : entry.recipient.name}
        {entry.collaborators?.length ? <span className="text-muted"> (joint work with {entry.collaborators.map((c) => c.name).join(', ')})</span> : null}
      </p>
      {showSummary && entry.summary && <p className="mt-1 line-clamp-2 max-w-3xl font-serif text-[0.95rem] text-muted">{entry.summary}</p>}
    </li>
  );
}

export function AwardList({ entries, showSummary }: { entries: AwardEntry[]; showSummary?: boolean }) {
  return (
    <ul>
      {entries.map((e) => (
        <AwardListItem key={e.slug} entry={e} showSummary={showSummary} />
      ))}
    </ul>
  );
}
