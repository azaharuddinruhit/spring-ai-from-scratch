import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * One question through RetrievalAugmentationAdvisor (Spring AI 2.0.2), placed after MessageChatMemoryAdvisor as in the lesson.
 * From the classes, and checked by running them:
 * - The query is the last user message; its history is every message in the prompt, the new one included.
 * - Query transformers run in order, then the expander; MultiQueryExpander splits the reply on "\n", falls back to the
 *   original query when the count is wrong, and puts the original first. Identical queries make the advisor throw
 *   IllegalStateException (Duplicate key) because results are collected into a map keyed by Query.
 * - VectorStoreDocumentRetriever uses the request's FILTER_EXPRESSION instead of its own filter, not in addition to it.
 * - ConcatenationDocumentJoiner keeps the first document per id and sorts by score, highest first.
 * - ContextualQueryAugmenter renders the templates below with the original question; with no documents and
 *   allowEmptyContext false, the user message becomes the refusal instruction.
 * - Memory stores the question as typed, because it runs first.
 * The model replies and the similarity scores are invented for the example.
 */

interface Chunk {
  id: string;
  text: string;
  product: string;
  audience: 'CUSTOMER' | 'STAFF';
}

const CHUNKS: Chunk[] = [
  { id: 'c1', text: 'Refunds reach your card within 5 business days of approval.', product: 'billing', audience: 'CUSTOMER' },
  { id: 'c2', text: "Gift cards can't be refunded or exchanged for cash.", product: 'billing', audience: 'CUSTOMER' },
  { id: 'c3', text: 'Refunds over 500 USD need a manager override in the admin console.', product: 'billing', audience: 'STAFF' },
  { id: 'c4', text: 'Lost parcels are refunded once the carrier confirms the loss, usually within 10 days.', product: 'shipping', audience: 'CUSTOMER' },
  { id: 'c5', text: 'To refund a parcel without a ticket, use the internal credit tool.', product: 'shipping', audience: 'STAFF' },
  { id: 'c6', text: 'Annual plans are refunded in full during the first 30 days.', product: 'billing', audience: 'CUSTOMER' },
  { id: 'c7', text: 'Parcels ship within 2 business days.', product: 'shipping', audience: 'CUSTOMER' },
];

/** Invented similarity scores of each query against c1..c7. */
const SCORES: Record<string, number[]> = {
  'How long does a refund take?': [0.71, 0.48, 0.58, 0.61, 0.52, 0.55, 0.33],
  'And for a lost parcel?': [0.3, 0.2, 0.22, 0.52, 0.4, 0.15, 0.58],
  'Can I pay with Bitcoin?': [0.22, 0.31, 0.18, 0.12, 0.15, 0.2, 0.11],
  'refund processing time': [0.74, 0.42, 0.6, 0.58, 0.5, 0.52, 0.3],
  'lost parcel': [0.33, 0.18, 0.25, 0.66, 0.45, 0.14, 0.6],
  'Bitcoin payment': [0.2, 0.28, 0.16, 0.1, 0.14, 0.19, 0.1],
  'How long does a refund for a lost parcel take?': [0.6, 0.35, 0.5, 0.79, 0.6, 0.4, 0.45],
  'What is the refund time for a lost parcel?': [0.58, 0.33, 0.49, 0.77, 0.58, 0.38, 0.47],
  'How many days until a refund arrives?': [0.69, 0.41, 0.55, 0.57, 0.47, 0.5, 0.36],
  'When will I get my money back?': [0.66, 0.5, 0.49, 0.52, 0.44, 0.53, 0.25],
  'Refund timeline after approval': [0.73, 0.39, 0.62, 0.55, 0.5, 0.51, 0.28],
  'How long until a lost parcel is refunded?': [0.57, 0.31, 0.47, 0.8, 0.57, 0.37, 0.44],
  'Carrier refund time for missing packages': [0.52, 0.27, 0.45, 0.76, 0.6, 0.31, 0.42],
  'Is cryptocurrency accepted as payment?': [0.19, 0.27, 0.15, 0.1, 0.13, 0.18, 0.09],
  'Which payment methods are supported?': [0.31, 0.38, 0.2, 0.14, 0.17, 0.33, 0.12],
  'Can I use Bitcoin to pay?': [0.21, 0.3, 0.17, 0.11, 0.15, 0.2, 0.1],
};

const QUESTIONS = ['How long does a refund take?', 'And for a lost parcel?', 'Can I pay with Bitcoin?'];

type Transformer = 'none' | 'compression' | 'rewrite';
type FilterChoice = 'none' | 'product' | 'customer';

const FILTERS: Record<FilterChoice, { label: string; java: string | null; matches: (c: Chunk) => boolean; text: string }> = {
  none: { label: 'none', java: null, matches: (c) => c.audience === 'CUSTOMER', text: "audience == 'CUSTOMER' (the retriever's default)" },
  product: { label: "product == 'shipping'", java: `"product == 'shipping'"`, matches: (c) => c.product === 'shipping', text: "product == 'shipping'" },
  customer: {
    label: 'customerDocuments("shipping")',
    java: 'KnowledgeFilters.customerDocuments("shipping")',
    matches: (c) => c.audience === 'CUSTOMER' && c.product === 'shipping',
    text: "audience == 'CUSTOMER' && product == 'shipping'",
  },
};

interface Msg {
  role: 'USER' | 'ASSISTANT';
  text: string;
}

/** What the transformer model call returns in this simulation. */
function transform(kind: Transformer, query: string, history: Msg[]): string {
  if (kind === 'rewrite') {
    return { 'How long does a refund take?': 'refund processing time', 'And for a lost parcel?': 'lost parcel', 'Can I pay with Bitcoin?': 'Bitcoin payment' }[query]!;
  }
  if (kind === 'compression' && query === 'And for a lost parcel?') {
    return history.some((m) => m.text === 'How long does a refund take?') ? 'How long does a refund for a lost parcel take?' : 'What is the refund time for a lost parcel?';
  }
  return query;
}

const VARIANTS: Record<string, string[]> = {
  refund: ['How many days until a refund arrives?', 'When will I get my money back?', 'Refund timeline after approval'],
  parcel: ['How long until a lost parcel is refunded?', 'Carrier refund time for missing packages', 'What is the refund time for a lost parcel?'],
  bitcoin: ['Is cryptocurrency accepted as payment?', 'Which payment methods are supported?', 'Can I use Bitcoin to pay?'],
};

function variantsFor(query: string, repeat: boolean): string[] {
  const set = /bitcoin/i.test(query) ? VARIANTS.bitcoin : /parcel/i.test(query) ? VARIANTS.parcel : VARIANTS.refund;
  return repeat ? [query, ...set.slice(1)] : set;
}

function scoresFor(query: string): number[] {
  return SCORES[query] ?? SCORES['How long does a refund take?'];
}

const AUGMENT = (context: string, query: string) => `Context information is below.

---------------------
${context}
---------------------

Given the context information and no prior knowledge, answer the query.

Follow these rules:

1. If the answer is not in the context, just say that you don't know.
2. Avoid statements like "Based on the context..." or "The provided information...".

Query: ${query}

Answer:
`;

const EMPTY_CONTEXT = `The user query is outside your knowledge base.
Politely inform the user that you can't answer it.
`;

const COMPRESSION = (history: Msg[], query: string) => `Given the following conversation history and a follow-up query, your task is to synthesize
a concise, standalone query that incorporates the context from the history.
Ensure the standalone query is clear, specific, and maintains the user's intent.

Conversation history:
${history.map((m) => `${m.role}: ${m.text}`).join('\n')}

Follow-up query:
${query}

Standalone query:
`;

interface Settings {
  transformer: Transformer;
  expand: boolean;
  repeat: boolean;
  topK: number;
  threshold: number;
  filter: FilterChoice;
  allowEmpty: boolean;
}

interface Run {
  question: string;
  history: Msg[];
  transformed: string;
  queries: string[] | null;
  expansionNote?: string;
  error?: string;
  perQuery: { query: string; docs: { chunk: Chunk; score: number }[] }[];
  joined: { chunk: Chunk; score: number }[];
  userMessage: string;
  answer: string;
  modelCalls: number;
}

function run(question: string, memory: Msg[], s: Settings): Run {
  const history: Msg[] = [...memory, { role: 'USER', text: question }];
  const transformed = s.transformer === 'none' ? question : transform(s.transformer, question, history);
  let modelCalls = s.transformer === 'none' ? 0 : 1;
  let queries: string[] = [transformed];
  let expansionNote: string | undefined;
  if (s.expand) {
    modelCalls++;
    queries = [transformed, ...variantsFor(transformed, s.repeat)];
    expansionNote = 'MultiQueryExpander: 3 variants, with the original first (includeOriginal defaults to true).';
    if (new Set(queries).size < queries.length) {
      const dup = queries.find((q, i) => queries.indexOf(q) !== i)!;
      return {
        question, history, transformed, queries, expansionNote, perQuery: [], joined: [], userMessage: '', answer: '', modelCalls,
        error: `IllegalStateException: Duplicate key Query[text=${dup}, …]. The model returned the question itself as a variant, and the advisor collects results into a map keyed by Query.`,
      };
    }
  }
  const filter = FILTERS[s.filter];
  const perQuery = queries.map((query) => {
    const scores = scoresFor(query);
    const docs = CHUNKS.map((chunk, i) => ({ chunk, score: scores[i] }))
      .filter((d) => filter.matches(d.chunk) && d.score > s.threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, s.topK);
    return { query, docs };
  });
  const byId = new Map<string, { chunk: Chunk; score: number }>();
  perQuery.forEach((q) => q.docs.forEach((d) => byId.has(d.chunk.id) || byId.set(d.chunk.id, d)));
  const joined = [...byId.values()].sort((a, b) => b.score - a.score);
  modelCalls++;
  if (joined.length === 0) {
    return {
      question, history, transformed, queries: s.expand ? queries : null, expansionNote, perQuery, joined, modelCalls,
      userMessage: s.allowEmpty ? question : EMPTY_CONTEXT,
      answer: s.allowEmpty ? 'Yes, Acme Cloud accepts Bitcoin at checkout.' : "Sorry, I can't help with that: it isn't covered by the Acme Cloud help center.",
    };
  }
  return {
    question, history, transformed, queries: s.expand ? queries : null, expansionNote, perQuery, joined, modelCalls,
    userMessage: AUGMENT(joined.map((d) => d.chunk.text).join('\n'), question),
    answer: joined[0].chunk.text,
  };
}

function javaFor(s: Settings): string {
  const transformer =
    s.transformer === 'none'
      ? ''
      : `        .queryTransformers(${s.transformer === 'compression' ? 'CompressionQueryTransformer' : 'RewriteQueryTransformer'}.builder()
                .chatClientBuilder(builder)
                .build())
`;
  const expander = s.expand ? `        .queryExpander(MultiQueryExpander.builder()\n                .chatClientBuilder(builder)\n                .build())\n` : '';
  const augmenter = s.allowEmpty ? `        .queryAugmenter(ContextualQueryAugmenter.builder()\n                .allowEmptyContext(true)\n                .build())\n` : '';
  const filter = FILTERS[s.filter].java;
  return `RetrievalAugmentationAdvisor.builder()
${transformer}${expander}        .documentRetriever(VectorStoreDocumentRetriever.builder()
                .vectorStore(vectorStore)
                .topK(${s.topK})
                .similarityThreshold(${s.threshold.toFixed(1)})
                .filterExpression(KnowledgeFilters.customerDocuments())
                .build())
${augmenter}        .order(Ordered.HIGHEST_PRECEDENCE + 225)
        .build();${filter ? `\n\n// per request\n.advisors(a -> a.param(VectorStoreDocumentRetriever.FILTER_EXPRESSION,\n        ${filter}))` : ''}`;
}

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: ReactNode }) {
  return (
    <li className="relative min-w-0 border-l-2 border-slate-200 pb-4 pl-4 last:pb-0 dark:border-slate-700/70">
      <span className="absolute -left-[0.6rem] top-0 grid h-[1.1rem] w-[1.1rem] place-items-center rounded-full bg-brand-600 text-[0.65rem] font-semibold text-white dark:bg-brand-500">
        {n}
      </span>
      <h4 className="text-sm font-medium text-slate-900 dark:text-white">{title}</h4>
      {note && <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>}
      <div className="mt-1.5">{children}</div>
    </li>
  );
}

function Doc({ chunk, score }: { chunk: Chunk; score: number }) {
  return (
    <li className="flex gap-2 text-[0.8rem] leading-snug">
      <span className="code-mono shrink-0 text-slate-500 dark:text-slate-400">{score.toFixed(2)}</span>
      <span className={'min-w-0 ' + (chunk.audience === 'STAFF' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300')}>
        {chunk.text}
        <span className="code-mono ml-1.5 text-[0.7rem] text-slate-500 dark:text-slate-400">
          {chunk.audience}/{chunk.product}
        </span>
      </span>
    </li>
  );
}

export default function RagPipelineLab() {
  const [settings, setSettings] = useState<Settings>({ transformer: 'compression', expand: false, repeat: false, topK: 3, threshold: 0.5, filter: 'none', allowEmpty: false });
  const [memory, setMemory] = useState<Msg[]>([]);
  const [last, setLast] = useState<Run | null>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  const java = useMemo(() => javaFor(settings), [settings]);

  const send = (question: string) => {
    const result = run(question, memory, settings);
    setLast(result);
    if (!result.error) setMemory((m) => [...m, { role: 'USER', text: question }, { role: 'ASSISTANT', text: result.answer }]);
  };

  return (
    <LabFrame
      title="Inside RetrievalAugmentationAdvisor"
      hint="Ask the first question, then the follow-up. Change the modules between questions and compare what each step does."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Query transformer</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(['none', 'compression', 'rewrite'] as Transformer[]).map((t) => (
              <Pill key={t} active={settings.transformer === t} onClick={() => set('transformer', t)}>
                {t === 'none' ? 'none' : t === 'compression' ? 'Compression' : 'Rewrite'}
              </Pill>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">MultiQueryExpander</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={!settings.expand} onClick={() => set('expand', false)}>
              off
            </Pill>
            <Pill active={settings.expand && !settings.repeat} onClick={() => setSettings((s) => ({ ...s, expand: true, repeat: false }))}>
              3 variants
            </Pill>
            <Pill active={settings.expand && settings.repeat} onClick={() => setSettings((s) => ({ ...s, expand: true, repeat: true }))}>
              a variant repeats the query
            </Pill>
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">
            topK and similarityThreshold
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[1, 3, 5].map((k) => (
              <Pill key={k} active={settings.topK === k} onClick={() => set('topK', k)}>
                topK {k}
              </Pill>
            ))}
            {[0, 0.5, 0.7].map((t) => (
              <Pill key={t} active={settings.threshold === t} onClick={() => set('threshold', t)}>
                threshold {t.toFixed(1)}
              </Pill>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">FILTER_EXPRESSION on the request</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(Object.keys(FILTERS) as FilterChoice[]).map((f) => (
              <Pill key={f} active={settings.filter === f} onClick={() => set('filter', f)}>
                {FILTERS[f].label}
              </Pill>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">ContextualQueryAugmenter allowEmptyContext</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={!settings.allowEmpty} onClick={() => set('allowEmpty', false)}>
              false (default)
            </Pill>
            <Pill active={settings.allowEmpty} onClick={() => set('allowEmpty', true)}>
              true
            </Pill>
          </div>
        </fieldset>
      </div>

      <CodeView code={java} className="mt-4" />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Ask:</span>
        {QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
          >
            {q}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setMemory([]);
            setLast(null);
          }}
          disabled={!memory.length && !last}
          className="ml-auto text-xs text-slate-500 hover:text-brand-700 disabled:opacity-40"
        >
          Start over
        </button>
      </div>

      <div className="mt-4" aria-live="polite">
        {!last && <p className="text-sm text-slate-500 dark:text-slate-400">Ask a question to run the pipeline.</p>}
        {last && (
          <ol className="ml-2.5 mt-1">
            <Step n={1} title="Query" note="The last user message, with every message in the prompt as its history">
              <p className="text-sm text-slate-800 dark:text-slate-200">{last.question}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                history: {last.history.length} {last.history.length === 1 ? 'message' : 'messages'}, the question included
              </p>
            </Step>
            <Step
              n={2}
              title="Pre-retrieval"
              note={settings.transformer === 'none' && !settings.expand ? 'No transformer or expander: the query goes to the retriever as typed' : undefined}
            >
              {settings.transformer !== 'none' && (
                <>
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    <span className="text-slate-500 dark:text-slate-400">{settings.transformer === 'compression' ? 'CompressionQueryTransformer' : 'RewriteQueryTransformer'} → </span>
                    {last.transformed}
                  </p>
                  {settings.transformer === 'compression' && (
                    <details className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <summary className="cursor-pointer">The prompt it sends</summary>
                      <CodeView code={COMPRESSION(last.history, last.question)} className="mt-1.5" />
                    </details>
                  )}
                </>
              )}
              {last.queries && (
                <>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{last.expansionNote}</p>
                  <ol className="mt-1 list-decimal pl-5 text-sm text-slate-800 dark:text-slate-200">
                    {last.queries.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                </>
              )}
              {last.error && <p className="code-mono mt-2 text-[0.8rem] text-rose-700 [overflow-wrap:anywhere] dark:text-rose-300">{last.error}</p>}
            </Step>
            {!last.error && (
              <>
                <Step n={3} title="Retrieval" note={`One search per query, run in parallel. Filter: ${FILTERS[settings.filter].text}`}>
                  <div className="space-y-2">
                    {last.perQuery.map((q, i) => (
                      <div key={i}>
                        {last.perQuery.length > 1 && <p className="text-xs text-slate-500 dark:text-slate-400">{q.query}</p>}
                        {q.docs.length ? (
                          <ul className="space-y-1">
                            {q.docs.map((d) => (
                              <Doc key={d.chunk.id} {...d} />
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400">No document passed the filter and the threshold.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </Step>
                {last.perQuery.length > 1 && (
                  <Step n={4} title="Join" note="ConcatenationDocumentJoiner: one copy of each document, highest score first">
                    <ul className="space-y-1">
                      {last.joined.map((d) => (
                        <Doc key={d.chunk.id} {...d} />
                      ))}
                    </ul>
                  </Step>
                )}
                <Step
                  n={last.perQuery.length > 1 ? 5 : 4}
                  title="Augmentation"
                  note={last.joined.length ? 'The user message the model receives, built from the original question' : settings.allowEmpty ? 'No documents, and allowEmptyContext is true: the question goes through unchanged' : 'No documents: the question is replaced'}
                >
                  <CodeView code={last.userMessage} />
                </Step>
                <Step n={last.perQuery.length > 1 ? 6 : 5} title="Answer" note={`${last.modelCalls} chat model ${last.modelCalls === 1 ? 'call' : 'calls'} and ${last.perQuery.length} ${last.perQuery.length === 1 ? 'embedding' : 'embeddings'} for this question`}>
                  <p className={'text-sm ' + (last.joined[0]?.chunk.audience === 'STAFF' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-800 dark:text-slate-200')}>{last.answer}</p>
                </Step>
              </>
            )}
          </ol>
        )}
      </div>

      {memory.length > 0 && (
        <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-700/70">
          <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">Chat memory: what MessageChatMemoryAdvisor stored</h4>
          <ol className="mt-2 space-y-1">
            {memory.map((m, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug">
                <span className="code-mono w-20 shrink-0 text-[0.75rem] text-slate-500 dark:text-slate-400">{m.role}</span>
                <span className="min-w-0 text-slate-700 dark:text-slate-300">{m.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">The scores and the model's replies are made up for this example; the pipeline steps are the real ones.</p>
    </LabFrame>
  );
}
