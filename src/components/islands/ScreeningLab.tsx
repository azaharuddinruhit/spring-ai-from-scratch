import { useState, type ReactNode } from 'react';
import { CodeView, LabFrame, Pill, Slider } from './LabFrame';
import recorded from '../../data/recorded-rag.json';

/*
 * Recorded, not invented (lesson-src/preview-2.1/probes/rag-to-sandbox.py): three questions against eight passages in a
 * SimpleVectorStore with nomic-embed-text; DecisionDocumentFilter's four probabilities and DecisionDocumentReranker's score
 * from d1-omni:600m (recorded on Spring AI 2.1.0-RC2; KnowledgeChatIT gets the same passages on 2.1.0); and a 27B Qwen 3 reasoning model's own labels for every pair. The controls replay
 * those numbers through the filter's rule order and the reranker's cut; nothing here calls a model.
 */

interface Passage {
  id: string;
  text: string;
  similarity: number;
  relevance: number;
  evidence: number;
  contradiction: number;
  injection: number;
  rerank: number;
  judge: { answers: boolean; contradicts: boolean; injection: boolean; millis: number; completionTokens: number };
}

const QUESTIONS = recorded as { question: string; passages: Passage[] }[];

interface Settings {
  topK: number;
  injection: number;
  contradiction: number;
  relevance: number;
  evidence: number;
  rerankTopK: number;
  minimumScore: number;
}

/** Spring AI's defaults: Policy.defaults(), and a reranker that keeps everything. */
const DEFAULTS: Settings = { topK: 6, injection: 0.7, contradiction: 0.7, relevance: 0.45, evidence: 0.55, rerankTopK: 8, minimumScore: 0 };
/** What the lesson's application.yaml sets. */
const LESSON: Settings = { ...DEFAULTS, contradiction: 1, rerankTopK: 3, minimumScore: 0.4 };

type Outcome =
  | { kind: 'not-retrieved'; rank: number }
  | { kind: 'excluded'; why: string }
  | { kind: 'reranked-out'; why: string }
  | { kind: 'prompt'; conflicting: boolean; position: number };

/** DecisionDocumentFilter.classify(): the first rule that matches wins, and every comparison is strict. */
function classify(p: Passage, s: Settings): 'INCLUDED' | 'CONFLICTING' | { excluded: string } {
  if (p.injection > s.injection) return { excluded: `injection ${p.injection.toFixed(2)} > ${s.injection.toFixed(2)}` };
  if (p.contradiction > s.contradiction) return 'CONFLICTING';
  if (p.relevance < s.relevance) return { excluded: `relevance ${p.relevance.toFixed(2)} < ${s.relevance.toFixed(2)}` };
  if (p.evidence > s.evidence) return 'INCLUDED';
  return { excluded: `evidence ${p.evidence.toFixed(2)} not > ${s.evidence.toFixed(2)}` };
}

function run(passages: Passage[], s: Settings): Map<string, Outcome> {
  const outcomes = new Map<string, Outcome>();
  const bySimilarity = [...passages].sort((a, b) => b.similarity - a.similarity);
  const kept: { p: Passage; conflicting: boolean }[] = [];
  bySimilarity.forEach((p, i) => {
    if (i >= s.topK) {
      outcomes.set(p.id, { kind: 'not-retrieved', rank: i + 1 });
      return;
    }
    const c = classify(p, s);
    if (typeof c === 'object') outcomes.set(p.id, { kind: 'excluded', why: c.excluded });
    else kept.push({ p, conflicting: c === 'CONFLICTING' });
  });
  kept
    .sort((a, b) => b.p.rerank - a.p.rerank)
    .forEach(({ p, conflicting }, i) => {
      if (p.rerank < s.minimumScore) {
        outcomes.set(p.id, { kind: 'reranked-out', why: `score ${p.rerank.toFixed(2)} < ${s.minimumScore.toFixed(2)}` });
      } else if (i >= s.rerankTopK) {
        outcomes.set(p.id, { kind: 'reranked-out', why: `score ${p.rerank.toFixed(2)}, beyond top ${s.rerankTopK}` });
      } else {
        outcomes.set(p.id, { kind: 'prompt', conflicting, position: i + 1 });
      }
    });
  return outcomes;
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{children}</p>;
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const [text, style] =
    outcome.kind === 'prompt'
      ? [
          outcome.conflicting ? `in the prompt #${outcome.position}, CONFLICTING` : `in the prompt #${outcome.position}`,
          'border-brand-600/40 bg-brand-50 text-brand-900 dark:bg-brand-400/10 dark:text-brand-200',
        ]
      : outcome.kind === 'excluded'
        ? [`filtered out: ${outcome.why}`, 'border-slate-400/50 text-slate-600 dark:text-slate-300']
        : outcome.kind === 'reranked-out'
          ? [`reranked out: ${outcome.why}`, 'border-slate-400/50 text-slate-600 dark:text-slate-300']
          : [`not retrieved (similarity rank ${outcome.rank})`, 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400'];
  return <span className={'rounded-md border px-1.5 py-0.5 font-mono text-[0.7rem] [overflow-wrap:anywhere] ' + style}>{text}</span>;
}

function judgeLabel(j: Passage['judge']): string {
  const labels = [j.answers && 'answers it', j.contradicts && 'contradicts it', j.injection && 'instructions to an assistant'].filter(Boolean);
  return labels.length ? labels.join(', ') : 'off topic';
}

const FIELDS: { key: 'relevance' | 'evidence' | 'contradiction' | 'injection'; label: string }[] = [
  { key: 'relevance', label: 'relevant' },
  { key: 'evidence', label: 'evidence' },
  { key: 'contradiction', label: 'contradicts' },
  { key: 'injection', label: 'injection' },
];

export default function ScreeningLab() {
  const [question, setQuestion] = useState(0);
  const [settings, setSettings] = useState<Settings>(LESSON);
  const set = (key: keyof Settings) => (value: number) => setSettings((s) => ({ ...s, [key]: value }));

  const { passages } = QUESTIONS[question];
  const outcomes = run(passages, settings);
  const shown = [...passages].sort((a, b) => b.similarity - a.similarity);
  const inPrompt = shown.filter((p) => outcomes.get(p.id)?.kind === 'prompt');
  const answering = passages.filter((p) => p.judge.answers && !p.judge.injection);
  const java = `DecisionDocumentFilter.builder(decisionModel)
        .policy(new DecisionDocumentFilter.Policy(
                ${settings.injection.toFixed(2)}, // injection
                ${settings.contradiction.toFixed(2)}, // contradiction
                ${settings.relevance.toFixed(2)}, // relevance
                ${settings.evidence.toFixed(2)})) // evidence
        .failClosed(true)
        .build();

DecisionDocumentReranker.builder(decisionModel)
        .topK(${settings.rerankTopK})
        .minimumScore(${settings.minimumScore.toFixed(2)})
        .build();`;

  return (
    <LabFrame
      title="Screen and rerank retrieved passages"
      hint="Three questions recorded against eight passages through d1-omni:600m. Change the policy and the reranker cut, and see which passages reach the prompt."
    >
      <fieldset className="min-w-0">
        <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">The question</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {QUESTIONS.map((q, i) => (
            <Pill key={q.question} active={i === question} onClick={() => setQuestion(i)}>
              {q.question}
            </Pill>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Settings</span>
        <Pill active={JSON.stringify(settings) === JSON.stringify(DEFAULTS)} onClick={() => setSettings(DEFAULTS)}>
          Spring AI defaults
        </Pill>
        <Pill active={JSON.stringify(settings) === JSON.stringify(LESSON)} onClick={() => setSettings(LESSON)}>
          This lesson
        </Pill>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Slider id="sl-injection" label="Policy injection" value={settings.injection} onChange={set('injection')} min={0.05} max={1}
          note="Above it, dropped. Checked first." />
        <Slider id="sl-contradiction" label="Policy contradiction" value={settings.contradiction} onChange={set('contradiction')} min={0.05} max={1}
          note="Above it, kept as CONFLICTING, before relevance is checked. 1.00 turns it off." />
        <Slider id="sl-relevance" label="Policy relevance" value={settings.relevance} onChange={set('relevance')} min={0.05} max={1}
          note="Below it, dropped." />
        <Slider id="sl-evidence" label="Policy evidence" value={settings.evidence} onChange={set('evidence')} min={0.05} max={1}
          note="Above it, INCLUDED; otherwise dropped." />
        <Slider id="sl-topk" label="Reranker topK" value={settings.rerankTopK} onChange={set('rerankTopK')} min={1} max={8} step={1} digits={0}
          note="How many screened passages reach the prompt. 8 here means no limit, the default." />
        <Slider id="sl-minimum" label="Reranker minimumScore" value={settings.minimumScore} onChange={set('minimumScore')} min={0} max={0.9}
          note="Below it, a screened passage is left out. The default is 0." />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center" aria-live="polite">
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">In the prompt</dt>
          <dd className="font-mono text-lg text-slate-900 tabular-nums dark:text-white">{inPrompt.length} of 6</dd>
        </div>
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">That answer it</dt>
          <dd className="font-mono text-lg text-slate-900 tabular-nums dark:text-white">
            {inPrompt.filter((p) => p.judge.answers && !p.judge.injection).length} of {answering.length}
          </dd>
        </div>
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Injected or off topic</dt>
          <dd
            className={
              'font-mono text-lg tabular-nums ' +
              (inPrompt.some((p) => p.judge.injection || !p.judge.answers) ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white')
            }
          >
            {inPrompt.filter((p) => p.judge.injection || !p.judge.answers).length}
          </dd>
        </div>
      </dl>
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
        "Answer it" and "injected" are the 27B reasoning model's labels, not d1-omni's.
      </p>

      <div className="mt-4">
        <Label>The eight passages, by vector similarity; the search returns the top six</Label>
        <ul className="mt-1.5 space-y-2">
          {shown.map((p) => {
            const outcome = outcomes.get(p.id)!;
            const retrieved = outcome.kind !== 'not-retrieved';
            return (
              <li
                key={p.id}
                className={
                  'rounded-md border p-3 ' +
                  (outcome.kind === 'prompt'
                    ? 'border-brand-600/50 dark:border-brand-500/50'
                    : 'border-slate-200 dark:border-slate-700/70') +
                  (retrieved ? '' : ' opacity-70')
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {p.id} <span className="text-slate-500 dark:text-slate-400">similarity {p.similarity.toFixed(3)}</span>
                  </span>
                  <OutcomeBadge outcome={outcome} />
                </div>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{p.text}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-xs sm:grid-cols-5">
                  {FIELDS.map((f) => (
                    <span key={f.key} className="text-slate-600 tabular-nums dark:text-slate-400">
                      {f.label} <span className="text-slate-900 dark:text-white">{p[f.key].toFixed(3)}</span>
                    </span>
                  ))}
                  <span className="text-slate-600 tabular-nums dark:text-slate-400">
                    rerank <span className="text-slate-900 dark:text-white">{p.rerank.toFixed(3)}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Judge: <span className="text-slate-700 dark:text-slate-300">{judgeLabel(p.judge)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700/70">
        <Label>These settings in Java</Label>
        <CodeView code={java} lang="java" className="mt-1.5" />
      </div>
    </LabFrame>
  );
}
