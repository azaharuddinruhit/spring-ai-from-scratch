import type { ReactNode } from 'react';

interface LabFrameProps {
  title: string;
  hint: string;
  children: ReactNode;
}

/** Shared frame for every interactive sandbox: the title, a one-line how-to, and a note that it's a simulation. */
export function LabFrame({ title, hint, children }: LabFrameProps) {
  return (
    <section className="not-prose my-6 overflow-hidden rounded-xl border border-slate-200 border-t-brand-600 border-t-2 bg-white dark:border-slate-700/70 dark:border-t-brand-400 dark:bg-slate-800/40">
      <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-700/70">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">Simulated in your browser, no API key needed</span>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{hint}</p>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ' +
        (active
          ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-200'
          : 'border-slate-300 text-slate-700 hover:border-brand-500 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-500 dark:hover:text-brand-300')
      }
    >
      {children}
    </button>
  );
}

/** The same icon-only copy button as the lesson code viewer (styles in global.css). */
export function CopyButton({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button type="button" className={'copy-btn' + (done ? ' is-done' : '')} aria-label={done ? 'Copied' : label} title="Copy code" onClick={onClick}>
      <svg className="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      <svg className="icon-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>
  );
}

export function CodeView({ code, className = '' }: { code: string; className?: string }) {
  return (
    <pre
      className={
        'code-mono overflow-x-auto rounded-md border border-(--code-border) bg-(--code-bg) px-3.5 py-3 text-[0.8rem] leading-[1.65] text-(--code-fg) ' +
        className
      }
    >
      <code>{code}</code>
    </pre>
  );
}
