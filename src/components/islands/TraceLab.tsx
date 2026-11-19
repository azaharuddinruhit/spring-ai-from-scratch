import { useState, type ReactNode } from 'react';
import { LabFrame } from './LabFrame';
import recorded from '../../data/recorded-traces.json';

/*
 * Recorded, not invented (lesson-src/module-6/probes/trace-to-sandbox.py): every span of a two-turn conversation with the
 * support app, Spring AI 2.0.2 and Boot 4.1.2, llama3.2:3b and nomic-embed-text in Ollama, pgvector in PostgreSQL 17, on a
 * CPU. "before" is the Module 5 RAG config; "after" is this lesson's, recorded with log-prompt, log-completion and the tools'
 * include-content switched on. Span ids, names, attributes and timings are as the tracer saw them.
 */

type Kind = 'client' | 'advisor' | 'model' | 'embedding' | 'vector' | 'tool';
type Version = 'before' | 'after';

interface Span {
  id: string;
  parent: string | null;
  name: string;
  kind: Kind;
  start: number;
  dur: number;
  attrs: [string, string][];
  content?: [string, string][];
  logged?: { prompt?: string; completion?: string };
}

interface Turn {
  question: string;
  answer: string;
  traceId: string;
  spans: Span[];
}

const RUNS = recorded as unknown as Record<Version, Turn[]>;

/** The models the recording used, and the OpenAI models the support app uses in production. */
const PRODUCTION_MODEL: Record<string, string> = { 'llama3.2:3b': 'gpt-5-mini', 'qwen2.5:1.5b': 'gpt-5-nano' };
/** USD per million tokens, OpenAI Standard tier list prices on 19 November 2026. */
const PRICE: Record<string, { input: number; output: number }> = {
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
};

const VERSIONS: Record<Version, string> = { before: 'Module 5 config', after: 'This lesson' };

const KIND_LABEL: Record<Kind, string> = {
  client: 'ChatClient call',
  advisor: 'advisor',
  model: 'model call',
  embedding: 'embedding call',
  vector: 'vector search',
  tool: 'tool call',
};

const BAR: Record<Kind, string> = {
  client: 'bg-slate-400 dark:bg-slate-500',
  advisor: 'bg-slate-300 dark:bg-slate-600',
  model: 'bg-sky-600 dark:bg-sky-400',
  embedding: 'bg-violet-500 dark:bg-violet-400',
  vector: 'bg-violet-500 dark:bg-violet-400',
  tool: 'bg-amber-500 dark:bg-amber-400',
};

/** What to look at first in each recording. */
const STORY: Record<Version, [string, string]> = {
  before: [
    'Before the search, CompressionQueryTransformer sent this first question to the model, and the vector store searched for its reply: "Can you please provide the follow-up query to synthesize into a concise query?". Nothing in the answer shows it; the db.vector.query.content attribute does.',
    'Three model calls again: the rewrite, then the answer, then one more because the model called proposeRefund for a question about refund times. With content off, the trace shows that the tool ran but not what it was asked to do.',
  ],
  after: [
    'A first question has no earlier answer to resolve against, so it is searched as asked. One model call fewer, and the search finds what the customer typed. With content on, the tool span holds the order: total, date and tracking number.',
    'A follow-up, so the rewrite runs, on the smaller model. Its 10.7 s is not how fast the small model is: Ollama first had to load a second model on this CPU-only machine (alone, a cold load took 2.8 s of a 3.5 s call), and a hosted model has no load step. With content on, the proposeRefund span shows the model proposing a refund of order 1042 that nobody asked for.',
  ],
};

/** The first turn's story is the search, the second turn's the tool call. */
const focusOf = (turn: Turn, index: number) => turn.spans.find((s) => s.kind === (index === 0 ? 'vector' : 'tool'))!.id;

const attr = (span: Span, key: string) => span.attrs.find(([k]) => k === key)?.[1];

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-md border px-2.5 py-1 text-left text-sm transition-colors ' +
        (active
          ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-200'
          : 'border-slate-300 text-slate-700 hover:border-brand-500 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-500 dark:hover:text-brand-300')
      }
    >
      {children}
    </button>
  );
}

export default function TraceLab() {
  const [version, setVersion] = useState<Version>('before');
  const [index, setIndex] = useState(0);
  const [advisors, setAdvisors] = useState(false);
  const [content, setContent] = useState(true);
  const turn = RUNS[version][index];
  const [selected, setSelected] = useState(() => focusOf(RUNS.before[0], 0));

  const pick = (v: Version, i: number) => {
    setVersion(v);
    setIndex(i);
    setSelected(focusOf(RUNS[v][i], i));
  };

  const byId = new Map(turn.spans.map((s) => [s.id, s]));
  const visible = turn.spans.filter((s) => advisors || s.kind !== 'advisor');
  const depth = (span: Span) => {
    let d = 0;
    for (let p = span.parent && byId.get(span.parent); p; p = p.parent ? byId.get(p.parent) : undefined) {
      if (advisors || p.kind !== 'advisor') d++;
    }
    return d;
  };
  const total = Math.max(...turn.spans.map((s) => s.start + s.dur));
  const span = byId.get(selected) ?? turn.spans[0];
  const showContent = content && version === 'after';

  const calls = turn.spans.filter((s) => s.kind === 'model');
  const tokens = (s: Span, key: string) => Number(attr(s, key) ?? 0);
  const input = calls.reduce((n, s) => n + tokens(s, 'gen_ai.usage.input_tokens'), 0);
  const output = calls.reduce((n, s) => n + tokens(s, 'gen_ai.usage.output_tokens'), 0);
  const dollars = calls.reduce((sum, s) => {
    const price = PRICE[PRODUCTION_MODEL[attr(s, 'gen_ai.request.model') ?? '']];
    return sum + (tokens(s, 'gen_ai.usage.input_tokens') * price.input + tokens(s, 'gen_ai.usage.output_tokens') * price.output) / 1e6;
  }, 0);
  const smaller = calls.some((s) => attr(s, 'gen_ai.request.model') === 'qwen2.5:1.5b');

  return (
    <LabFrame
      title="Trace a support request"
      hint="Recorded from the support app with llama3.2:3b in Ollama: two turns of one chat, before and after this lesson. Pick a span to see what it records."
    >
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Config</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(Object.keys(VERSIONS) as Version[]).map((v) => (
              <Choice key={v} active={v === version} onClick={() => pick(v, index)}>
                {VERSIONS[v]}
              </Choice>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">The customer asks</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {RUNS[version].map((t, i) => (
              <Choice key={i} active={i === index} onClick={() => pick(version, i)}>
                {t.question}
              </Choice>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 font-mono text-xs text-slate-600 dark:text-slate-400">
          <input type="checkbox" className="accent-brand-600" checked={advisors} onChange={(e) => setAdvisors(e.target.checked)} />
          spring.ai.advisor spans
        </label>
        <label
          className={
            'flex items-center gap-2 font-mono text-xs ' +
            (version === 'after' ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500')
          }
        >
          <input
            type="checkbox"
            className="accent-brand-600"
            checked={showContent}
            disabled={version !== 'after'}
            onChange={(e) => setContent(e.target.checked)}
          />
          log-prompt, log-completion, include-content
          {version !== 'after' && <span className="font-sans">(recorded off)</span>}
        </label>
      </div>

      <p className="mt-4 text-sm text-slate-800 dark:text-slate-200" aria-live="polite">
        <span className="font-medium tabular-nums">{calls.length}</span> model calls,{' '}
        <span className="font-medium tabular-nums">{input}</span> input and{' '}
        <span className="font-medium tabular-nums">{output}</span> output tokens, {ms(total)}. At{' '}
        {smaller ? 'gpt-5-mini and gpt-5-nano' : 'gpt-5-mini'} prices:{' '}
        <span className="font-medium tabular-nums">${(dollars * 10_000).toFixed(2)}</span> per 10,000 such requests.
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Token counts are llama3.2's and OpenAI's tokenizer counts differently. Times are from a CPU-only machine, and output lengths vary run to run.
      </p>

      <ol className="mt-3 rounded-md border border-slate-200 py-1 dark:border-slate-700/70" aria-label="Spans">
        {visible.map((s) => {
          const active = s.id === span.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                aria-pressed={active}
                style={
                  active
                    ? { background: 'var(--code-highlight)', boxShadow: 'inset 3px 0 0 var(--code-highlight-bar)' }
                    : undefined
                }
                className="grid w-full grid-cols-1 items-center gap-x-3 gap-y-1 px-3 py-1.5 text-left hover:bg-slate-50 sm:grid-cols-[minmax(0,16rem)_1fr] dark:hover:bg-slate-800/60"
              >
                <span className="flex min-w-0 items-baseline justify-between gap-2" style={{ paddingLeft: `${Math.min(depth(s), 8) * 0.5}rem` }}>
                  <span className="truncate font-mono text-xs text-slate-800 dark:text-slate-200">{s.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">{ms(s.dur)}</span>
                </span>
                <span className="relative block h-2.5 rounded-sm bg-slate-100 dark:bg-slate-800">
                  <span
                    className={'absolute inset-y-0 rounded-sm ' + BAR[s.kind]}
                    style={{ left: `${(s.start / total) * 100}%`, width: `max(2px, ${(s.dur / total) * 100}%)` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700/70">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{span.name}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {KIND_LABEL[span.kind]}, {ms(span.dur)}
          </span>
        </p>
        <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,14rem)_1fr]">
          {[...span.attrs, ...(showContent ? (span.content ?? []) : [])].map(([key, value]) => {
            const added = span.content?.some(([k]) => k === key);
            return (
              <div key={key} className="contents">
                <dt className={'font-mono text-xs [overflow-wrap:anywhere] ' + (added ? 'text-amber-800 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400')}>
                  {key}
                </dt>
                <dd className="mb-1 font-mono text-xs [overflow-wrap:anywhere] text-slate-800 sm:mb-0 dark:text-slate-200">{value}</dd>
              </div>
            );
          })}
        </dl>
        {showContent && span.content && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
            The two tool attributes exist only with include-content on, and go to your trace backend with every span.
          </p>
        )}
        {showContent && span.logged && (
          <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700/70">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Logged at INFO, not in the span, under{' '}
              <span className="font-mono [overflow-wrap:anywhere]">
                [{turn.traceId}-{span.id}]
              </span>
            </p>
            {(['prompt', 'completion'] as const).map(
              (part) =>
                span.logged?.[part] !== undefined && (
                  <div key={part} className="mt-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {part === 'prompt' ? 'Chat Model Prompt Content' : 'Chat Model Completion'}
                      {span.logged?.[part] === '[]' && ', empty because this reply was a tool call'}
                    </p>
                    <pre className="mt-0.5 max-h-48 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs whitespace-pre-wrap text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                      {span.logged[part]}
                    </pre>
                  </div>
                ),
            )}
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-slate-700 dark:text-slate-300">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">The answer</p>
        <p className="mt-1">{turn.answer}</p>
        <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">What this trace shows</p>
        <p className="mt-1">{STORY[version][index]}</p>
      </div>
    </LabFrame>
  );
}
