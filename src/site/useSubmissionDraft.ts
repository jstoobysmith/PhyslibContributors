import { useEffect, useMemo, useState } from 'react';
import { isoSeconds, sectionById, type EvidenceKind, type SectionId } from '../lib/config';
import { githubLoginFromInput, normaliseUrl, submissionSchema, submissionSlug } from '../lib/submission';

export interface EvidenceDraft {
  url: string;
  kind: EvidenceKind;
  title: string;
  description: string;
  /** Whether the kind was picked by hand (otherwise it is guessed from the link). */
  kindChosen?: boolean;
}

export interface PersonDraft {
  github: string;
  name: string;
}

export interface Draft {
  section: SectionId;
  title: string;
  summary: string;
  name: string;
  github: string;
  orcid: string;
  nominating: boolean;
  nominatedBy: string;
  consent: boolean;
  collaborators: PersonDraft[];
  from: string;
  to: string;
  evidence: EvidenceDraft[];
}

const STORAGE_KEY = 'physlib-contributions:draft';

export const emptyEvidence = (kind: EvidenceKind = 'pull-request'): EvidenceDraft => ({ url: '', kind, title: '', description: '' });

function blankDraft(section: string | null): Draft {
  const s = sectionById(section ?? '');
  return {
    section: s?.id ?? 'review',
    title: '',
    summary: '',
    name: '',
    github: '',
    orcid: '',
    nominating: false,
    nominatedBy: '',
    consent: false,
    collaborators: [],
    from: '',
    to: '',
    evidence: [emptyEvidence(s?.evidenceKinds[0])],
  };
}

function loadDraft(section: string | null): Draft {
  const blank = blankDraft(section);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Draft> | null;
    if (saved) return { ...blank, ...saved, section: section && sectionById(section) ? blank.section : (saved.section ?? blank.section) };
  } catch {
    /* no saved draft */
  }
  return blank;
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);
const login = githubLoginFromInput;

/** Turns the form into a submission object (validated separately). */
export function toSubmission(d: Draft, submittedAt: string): unknown {
  const collaborators = d.collaborators.filter((c) => c.github.trim() || c.name.trim()).map((c) => ({ github: login(c.github), name: c.name.trim() }));
  return {
    section: d.section,
    title: d.title.trim(),
    summary: d.summary.trim(),
    recipient: { github: login(d.github), name: d.name.trim(), orcid: opt(d.orcid) },
    ...(collaborators.length ? { collaborators } : {}),
    ...(d.from || d.to ? { period: { from: d.from, to: d.to } } : {}),
    evidence: d.evidence
      .filter((e) => e.url.trim() || e.title.trim())
      .map((e) => ({ url: normaliseUrl(e.url), kind: e.kind, title: opt(e.title), description: opt(e.description) })),
    ...(d.nominating ? { nominatedBy: login(d.nominatedBy), recipientConsent: d.consent || undefined } : {}),
    submittedAt,
  };
}

/** The submission form's state, saved in the browser between visits, with live validation. */
export function useSubmissionDraft(initialSection: string | null) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft(initialSection));
  const [submittedAt] = useState(() => isoSeconds());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable */
    }
  }, [draft]);

  const parsed = useMemo(() => submissionSchema.safeParse(toSubmission(draft, submittedAt)), [draft, submittedAt]);
  const errors = useMemo(() => {
    const map: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) map[i.path.join('.')] ??= i.message;
    return map;
  }, [parsed]);
  const submission = parsed.success ? parsed.data : undefined;

  return {
    draft,
    set: <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v })),
    update: (fn: (d: Draft) => Draft) => setDraft(fn),
    errors,
    submission,
    slug: submission ? submissionSlug(submission) : '',
    clear: () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setDraft(blankDraft(draft.section));
    },
  };
}
