import { useRef, type CSSProperties, type ReactNode } from 'react';
import { tokenize, type CodeLang } from '../../lib/code-tokens';
import { prettyJson } from '../../lib/json-format';

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

/** A labelled range input with its value and a one-line note under it. Defaults suit a probability threshold. */
export function Slider({
  id,
  label,
  value,
  onChange,
  note,
  min = 0.05,
  max = 0.99,
  step = 0.01,
  digits = 2,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  note: string;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="min-w-0 text-xs font-medium [overflow-wrap:anywhere] text-slate-600 dark:text-slate-400">
          {label}
        </label>
        <span className="font-mono text-sm text-slate-900 tabular-nums dark:text-white">{value.toFixed(digits)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        aria-describedby={`${id}-note`}
        className="mt-1 w-full accent-brand-600"
      />
      <p id={`${id}-note`} className="text-xs text-slate-500 dark:text-slate-400">
        {note}
      </p>
    </div>
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

function highlighted(code: string, lang: CodeLang): ReactNode[] {
  return tokenize(code, lang).map(({ text, color }, i) =>
    color ? (
      <span key={i} className="tok" style={{ '--tok-light': color[0], '--tok-dark': color[1] } as CSSProperties}>
        {text}
      </span>
    ) : (
      text
    ),
  );
}

/** Code in the code palette; with `lang`, coloured like the lesson code (see src/lib/code-tokens.ts). */
export function CodeView({ code, lang, className = '' }: { code: string; lang?: CodeLang; className?: string }) {
  // Every JSON box is indented the same way, whatever the sandbox built. Lines never wrap; the box scrolls sideways.
  const shown = lang === 'json' ? prettyJson(code) : code;
  return (
    <pre
      className={
        'code-mono overflow-x-auto whitespace-pre rounded-md border border-(--code-border) bg-(--code-bg) px-3.5 py-3 text-[0.8rem] leading-[1.65] text-(--code-fg) ' +
        className
      }
    >
      <code>{lang ? highlighted(shown, lang) : shown}</code>
    </pre>
  );
}

/** An editable code box: a transparent textarea over the same code, highlighted, scrolled in step with it. */
export function CodeEditor({
  id,
  value,
  onChange,
  lang,
  rows,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  lang: CodeLang;
  rows: number;
  describedBy?: string;
}) {
  const layer = useRef<HTMLPreElement>(null);
  const box = 'code-mono m-0 px-3.5 py-3 text-[0.8rem] leading-[1.65] whitespace-pre';
  return (
    <div className="relative mt-1.5 overflow-hidden rounded-md border border-(--code-border) bg-(--code-bg)">
      <pre ref={layer} aria-hidden="true" className={'pointer-events-none absolute inset-0 overflow-hidden text-(--code-fg) ' + box}>
        {highlighted(value, lang)}
        {/* A trailing line, so the layer is as tall as the textarea when the text ends with a newline. */}
        {'\n'}
      </pre>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          layer.current?.scrollTo(e.currentTarget.scrollLeft, e.currentTarget.scrollTop);
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={rows}
        aria-describedby={describedBy}
        className={'relative block w-full resize-y bg-transparent text-transparent caret-(--code-fg) selection:bg-brand-500/25 ' + box}
      />
    </div>
  );
}
