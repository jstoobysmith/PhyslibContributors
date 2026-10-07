import type { ComponentProps, ReactNode } from 'react';
import { asset } from '../site/data';
import type { Section } from '../lib/config';

export function Container({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

/** Plain form-style buttons, like arXiv's. */
export function buttonClass(variant: 'primary' | 'plain' = 'plain') {
  return `inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-1 text-sm no-underline disabled:opacity-50 disabled:cursor-not-allowed ${
    variant === 'primary'
      ? 'border-band bg-band text-white hover:no-underline hover:opacity-90'
      : 'border-[#aaa] bg-[#f6f6f6] text-foreground hover:bg-[#ececec] hover:no-underline'
  }`;
}

/** A button that looks like a text link, for actions inside running text. */
export const linkButtonClass = 'cursor-pointer text-link hover:underline';

export function BadgeImage({ section, className = '' }: { section: Pick<Section, 'id' | 'reportName'>; className?: string }) {
  return <img src={asset(`badges/${section.id}.svg`)} alt={`${section.reportName} badge`} className={`select-none ${className}`} />;
}

export function OrcidIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={`inline-block align-[-2px] ${className}`} viewBox="0 0 24 24" aria-label="ORCID">
      <circle cx="12" cy="12" r="12" fill="#A6CE39" />
      <path fill="#fff" d="M7.2 6.6a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM6.5 9.6h1.4v8H6.5zm3.4 0h3.7c3.5 0 5.1 2.5 5.1 4 0 1.6-1.3 4-5.1 4H9.9zm1.4 6.7h2.2c3.1 0 3.8-2.3 3.8-2.7 0-1.4-.9-2.7-3.8-2.7h-2.2z" />
    </svg>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="py-4 text-sm text-muted" role="status">
      {label}…
    </p>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="border border-danger/40 bg-[#fdf3f2] px-3 py-2 text-sm text-danger">{children}</div>;
}

/** Page heading: serif title over a rule, with an optional lead paragraph. */
export function PageTitle({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 border-b border-rule pb-3">
      <h1 className="font-serif text-[1.75rem] font-bold leading-tight">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-[0.95rem] text-muted">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-sm border border-[#aaa] bg-white px-2 py-1.5 text-sm text-foreground placeholder:text-[#999] focus:border-link focus:outline-none';

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}
