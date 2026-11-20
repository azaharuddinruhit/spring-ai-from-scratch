import { useState, type ReactNode } from 'react';
import { LabFrame, Pill, Slider } from './LabFrame';
import recorded from '../../data/recorded-tool-search.json';

/*
 * Recorded, not invented (lesson-src/preview-2.1/probes/tool-search-to-sandbox.py): six customer requests answered by a 27B
 * Qwen 3 reasoning model through ToolSearchToolCallingAdvisor (recorded on Spring AI 2.1.0-RC2; 2.1.0 changed none of the classes involved) with each tool index, with Lucene limited to
 * three results, and with all ten tools and no search. The decision index used d1-omni:600m. Every model call, search and answer
 * is as recorded; only the decision threshold slider computes something: what DecisionToolIndex would have returned for the
 * recorded answers at another threshold.
 */

interface Search {
  query: string;
  maxResults: number | null;
  results: { tool: string; score: number | null }[];
  anyToolApplies?: number;
  bestTool?: [string, number][];
}

interface Call {
  toolsSent: string[];
  toolCalls: { name: string; arguments: string }[];
  promptTokens: number;
  completionTokens: number;
  millis: number;
}

interface Run {
  answer: string;
  millis: number;
  calls: Call[];
  searches: Search[];
}

type IndexKey = 'regex' | 'lucene' | 'lucene3' | 'vector' | 'decision' | 'none';

// JSON infers bestTool pairs as (string | number)[][], so the recording is cast through unknown to its real shape.
const DATA = recorded as unknown as { tools: { name: string; description: string }[]; requests: { request: string; runs: Record<IndexKey, Run> }[] };

const INDEXES: { key: IndexKey; label: string; note: string }[] = [
  { key: 'regex', label: 'Regex', note: 'The default. Keywords minus stop words, matched in names and descriptions.' },
  { key: 'lucene', label: 'Lucene', note: 'Full-text scoring over names and descriptions; hits under 0.25 are dropped.' },
  { key: 'lucene3', label: 'Lucene, 3 results', note: "This lesson's app: Lucene, and at most three tools per search." },
  { key: 'vector', label: 'Vector', note: 'Embedding similarity (nomic-embed-text). No threshold, so it always returns the limit.' },
  { key: 'decision', label: 'Decision', note: 'd1-omni:600m picks the best tool and judges whether any tool applies.' },
  { key: 'none', label: 'No tool search', note: 'All ten tools on every call, through the plain ToolCallingAdvisor.' },
];

const DEFAULT_LIMIT = 10;

/** DecisionToolIndex: nothing unless any_tool_applies reaches the threshold, then every option above 0, best first. */
function decisionResults(search: Search, threshold: number): string[] {
  if (search.anyToolApplies === undefined || search.bestTool === undefined) return [];
  if (search.anyToolApplies < threshold) return [];
  return search.bestTool.filter(([, p]) => p > 0).slice(0, search.maxResults ?? DEFAULT_LIMIT).map(([tool]) => tool);
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{children}</p>;
}

function ToolChip({ name, tone }: { name: string; tone: 'search' | 'found' | 'called' | 'plain' }) {
  const style = {
    search: 'border-slate-400/60 text-slate-600 dark:text-slate-300',
    found: 'border-brand-600/40 text-brand-800 dark:border-brand-400/40 dark:text-brand-200',
    called: 'border-brand-600 bg-brand-50 text-brand-900 dark:bg-brand-400/10 dark:text-brand-100',
    plain: 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400',
  }[tone];
  return <span className={'rounded-md border px-1.5 py-0.5 font-mono text-[0.7rem] [overflow-wrap:anywhere] ' + style}>{name}</span>;
}

function SearchBox({ search, decisionThreshold }: { search: Search; decisionThreshold: number }) {
  const isDecision = search.anyToolApplies !== undefined;
  const wouldReturn = isDecision ? decisionResults(search, decisionThreshold) : [];
  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700/70 dark:bg-slate-800/40">
      <p className="font-mono text-xs [overflow-wrap:anywhere] text-slate-700 dark:text-slate-300">
        toolSearchTool("{search.query}")
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {search.maxResults === null ? 'No limit: the index returns up to 10.' : `Limit sent to the index: ${search.maxResults}.`}
      </p>
      {isDecision ? (
        <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="shrink-0">any_tool_applies</span>
            <span className="relative h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 rounded-full bg-amber-500" style={{ width: `${search.anyToolApplies! * 100}%` }} />
              <span className="absolute -inset-y-1 w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${decisionThreshold * 100}%` }} />
            </span>
            <span className="font-mono text-slate-900 tabular-nums dark:text-white">{search.anyToolApplies!.toFixed(3)}</span>
          </div>
          <p className="mt-1">
            best_tool: {search.bestTool!.slice(0, 3).map(([tool, p]) => `${tool} ${p.toFixed(3)}`).join(', ')}
          </p>
          <p className="mt-1">
            {wouldReturn.length === 0 ? (
              <>Returned no tools: {search.anyToolApplies!.toFixed(3)} is below {decisionThreshold.toFixed(2)}.</>
            ) : (
              <>
                At {decisionThreshold.toFixed(2)} it would return {wouldReturn.slice(0, 3).join(', ')}
                {wouldReturn.length > 3 ? ` and ${wouldReturn.length - 3} more` : ''}. The model's next step at that threshold
                wasn't recorded.
              </>
            )}
          </p>
        </div>
      ) : search.results.length === 0 ? (
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">Returned no tools.</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Tools the search returned">
          {search.results.map((r) => (
            <li key={r.tool}>
              <ToolChip name={r.score === null ? r.tool : `${r.tool} ${r.score.toFixed(2)}`} tone="found" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ToolSearchLab() {
  const [request, setRequest] = useState(0);
  const [index, setIndex] = useState<IndexKey>('lucene3');
  const [threshold, setThreshold] = useState(0.5);

  const runs = DATA.requests[request].runs;
  const run = runs[index];
  const totalPrompt = (r: Run) => r.calls.reduce((sum, c) => sum + c.promptTokens, 0);
  const called = run.calls.flatMap((c) => c.toolCalls.map((t) => t.name)).filter((name) => name !== 'toolSearchTool');
  const baseline = totalPrompt(runs.none);
  const widest = Math.max(...INDEXES.map((i) => totalPrompt(runs[i.key])));

  let searchCursor = 0;
  const steps = run.calls.map((call) => ({
    call,
    searches: call.toolCalls.filter((t) => t.name === 'toolSearchTool').map(() => run.searches[searchCursor++]).filter(Boolean),
  }));

  return (
    <LabFrame
      title="Find the tools for each request"
      hint="Six requests recorded through a 27B model with each tool index. Pick a request and an index, and follow every model call."
    >
      <fieldset className="min-w-0">
        <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">The customer asks</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DATA.requests.map((r, i) => (
            <Pill key={r.request} active={i === request} onClick={() => setRequest(i)}>
              {r.request}
            </Pill>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 min-w-0">
        <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">tool-index-type</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {INDEXES.map((i) => (
            <Pill key={i.key} active={i.key === index} onClick={() => setIndex(i.key)}>
              {i.label}
            </Pill>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{INDEXES.find((i) => i.key === index)!.note}</p>
      </fieldset>

      {index === 'decision' && (
        <div className="mt-3 max-w-sm">
          <Slider
            id="ts-threshold"
            label="decision.applicability-threshold"
            value={threshold}
            onChange={setThreshold}
            min={0.05}
            max={0.95}
            note="At or above it, the index returns tools. The default is 0.50."
          />
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-3" aria-live="polite">
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Model calls</dt>
          <dd className="font-mono text-lg text-slate-900 tabular-nums dark:text-white">{run.calls.length}</dd>
        </div>
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Prompt tokens</dt>
          <dd className="font-mono text-lg text-slate-900 tabular-nums dark:text-white">{totalPrompt(run).toLocaleString('en')}</dd>
        </div>
        <div className="col-span-2 rounded-md border border-slate-200 p-2 sm:col-span-1 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Tools it called</dt>
          <dd className="font-mono text-sm leading-7 [overflow-wrap:anywhere] text-slate-900 dark:text-white">
            {called.length ? called.join(', ') : 'none'}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <Label>Every call to the model</Label>
        <ol className="mt-1.5 space-y-2">
          {steps.map(({ call, searches }, i) => (
            <li key={i} className="rounded-md border border-slate-200 p-3 dark:border-slate-700/70">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-slate-900 dark:text-white">Call {i + 1}</span>
                <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {call.promptTokens.toLocaleString('en')} prompt tokens · {(call.millis / 1000).toFixed(1)} s
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Tools sent ({call.toolsSent.length})</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {call.toolsSent.map((t) => (
                  <li key={t}>
                    <ToolChip name={t} tone={t === 'toolSearchTool' ? 'search' : 'plain'} />
                  </li>
                ))}
              </ul>
              {call.toolCalls.length > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">The model replied with a tool call</p>
              )}
              {call.toolCalls
                .filter((t) => t.name !== 'toolSearchTool')
                .map((t, k) => (
                  <p key={k} className="mt-1 font-mono text-xs [overflow-wrap:anywhere] text-brand-800 dark:text-brand-200">
                    {t.name}({t.arguments})
                  </p>
                ))}
              {searches.map((s, k) => (
                <SearchBox key={k} search={s} decisionThreshold={threshold} />
              ))}
              {call.toolCalls.length === 0 && (
                <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                  <span className="text-xs text-slate-500 dark:text-slate-400">The answer: </span>
                  {run.answer}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700/70">
        <Label>Prompt tokens for this request, all calls together</Label>
        <ul className="mt-2 space-y-1.5">
          {INDEXES.map((i) => {
            const tokens = totalPrompt(runs[i.key]);
            return (
              <li key={i.key} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                <span className={i.key === index ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}>
                  {i.label}
                </span>
                <span className="h-2 rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                  <span
                    className={'block h-2 rounded-full ' + (i.key === 'none' ? 'bg-slate-400' : i.key === index ? 'bg-brand-600' : 'bg-brand-600/40')}
                    style={{ width: `${(tokens / widest) * 100}%` }}
                  />
                </span>
                <span className="text-right font-mono text-slate-900 tabular-nums dark:text-white">{tokens.toLocaleString('en')}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {index === 'none'
            ? 'Sending all ten tools is the baseline.'
            : totalPrompt(run) <= baseline
              ? `${(baseline - totalPrompt(run)).toLocaleString('en')} fewer than sending all ten tools.`
              : `${(totalPrompt(run) - baseline).toLocaleString('en')} more than sending all ten tools.`}{' '}
          With ten tools, a search only pays off when it returns few of them.
        </p>
      </div>
    </LabFrame>
  );
}
