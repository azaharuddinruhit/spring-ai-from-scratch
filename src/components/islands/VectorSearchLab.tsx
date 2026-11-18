import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';
import { FilterParseError, jsonPathOf, matchesPgVector, parseFilter, toPgVectorSql, type Operand, type Scalar } from '../../lib/vector-filter';

/*
 * A similarity search on PgVectorStore (Spring AI 2.0.2). The filter goes through a port of FilterExpressionTextParser and
 * PgVectorFilterExpressionConverter (identical SQL to the jar on 2,000 generated expressions), and rows are matched by evaluating
 * that SQL/JSON path the way PostgreSQL 17 does (identical results on 1,046 expressions). The SQL template, the distance bound
 * (embedding <=> ? < 1 - similarityThreshold) and the SearchRequest defaults (topK 4, threshold 0.0) come from the classes.
 * The similarity scores are invented for the example; real ones come from the embedding model.
 */

interface Chunk {
  text: string;
  metadata: Record<string, Scalar>;
}

const CHUNKS: Chunk[] = [
  { text: 'Refunds reach your card within 5 business days of approval.', metadata: { source: 'billing-handbook.pdf', product: 'billing', audience: 'CUSTOMER' } },
  { text: "Gift cards can't be refunded or exchanged for cash.", metadata: { source: 'billing-faq.md', product: 'billing', audience: 'CUSTOMER' } },
  { text: 'Refunds over 500 USD need a manager override in the admin console.', metadata: { source: 'refund-runbook.md', product: 'billing', audience: 'STAFF' } },
  { text: 'Lost parcels are refunded once the carrier confirms the loss, usually within 10 days.', metadata: { source: 'shipping-faq.md', product: 'shipping', audience: 'CUSTOMER' } },
  { text: 'To refund a parcel without a ticket, use the internal credit tool.', metadata: { source: 'carrier-runbook.md', product: 'shipping', audience: 'STAFF' } },
  { text: 'Annual plans are refunded in full during the first 30 days.', metadata: { source: 'billing-handbook.pdf', product: 'billing', audience: 'CUSTOMER' } },
  { text: 'Reset your password from the sign-in page.', metadata: { source: 'account-faq.md', product: 'account', audience: 'CUSTOMER' } },
  { text: 'Parcels ship within 2 business days.', metadata: { source: 'shipping-faq.md', product: 'shipping', audience: 'CUSTOMER' } },
];

const QUESTIONS: { text: string; scores: number[] }[] = [
  { text: 'How long does a refund take?', scores: [0.71, 0.48, 0.58, 0.61, 0.52, 0.55, 0.12, 0.33] },
  { text: 'Can I get my money back for a gift card?', scores: [0.47, 0.78, 0.44, 0.36, 0.41, 0.39, 0.09, 0.15] },
  { text: 'How do I approve a large refund?', scores: [0.5, 0.35, 0.74, 0.4, 0.62, 0.38, 0.11, 0.14] },
];

type Mode = 'text' | 'concat' | 'builder' | 'or';

const MODES: Record<Mode, string> = {
  text: 'Text expression',
  concat: 'Product by concatenation',
  builder: 'Product with the builder',
  or: 'Builder: OR inside AND',
};

const TEXT_PRESETS = [
  '',
  "audience == 'CUSTOMER'",
  "audience == 'CUSTOMER' && product == 'billing'",
  "audience == 'CUSTOMER' && product in ['billing', 'shipping']",
  "NOT audience == 'STAFF' && product == 'billing'",
  "! audience == 'STAFF'",
];

const ATTACK = "billing' || audience == 'STAFF";

type Status = 'returned' | 'filtered' | 'threshold' | 'topk';
const STATUS: Record<Status, { label: string; className: string }> = {
  returned: { label: 'Returned', className: 'text-brand-700 dark:text-brand-300' },
  filtered: { label: 'Filtered out', className: 'text-slate-500 dark:text-slate-400' },
  threshold: { label: 'Below threshold', className: 'text-slate-500 dark:text-slate-400' },
  topk: { label: 'Past topK', className: 'text-slate-500 dark:text-slate-400' },
};

function quoteJava(s: string): string {
  return JSON.stringify(s);
}

interface Built {
  java: string;
  expression: Operand | null;
  skipped: string[];
  error?: string;
}

function buildFilter(mode: Mode, text: string, product: string, grouped: boolean): Built {
  const filterExpression = (src: string, java: string): Built => {
    if (!src.trim()) return { java, expression: null, skipped: [] };
    try {
      const { expression, skipped } = parseFilter(src);
      return { java, expression, skipped };
    } catch (e) {
      if (e instanceof FilterParseError) return { java, expression: null, skipped: [], error: 'FilterExpressionParseException: the parser rejects this expression.' };
      throw e;
    }
  };
  switch (mode) {
    case 'text':
      return filterExpression(text, text.trim() ? `        .filterExpression(${quoteJava(text)})\n` : '');
    case 'concat': {
      const src = `audience == 'CUSTOMER' && product == '${product}'`;
      return filterExpression(src, `        .filterExpression("audience == 'CUSTOMER' && product == '" + product + "'")\n`);
    }
    case 'builder':
      return {
        java: `        .filterExpression(b.and(b.eq("audience", "CUSTOMER"), b.eq("product", product)).build())\n`,
        expression: {
          kind: 'expr',
          type: 'AND',
          left: { kind: 'expr', type: 'EQ', left: { kind: 'key', key: 'audience' }, right: { kind: 'value', value: 'CUSTOMER' } },
          right: { kind: 'expr', type: 'EQ', left: { kind: 'key', key: 'product' }, right: { kind: 'value', value: product } },
        },
        skipped: [],
      };
    case 'or': {
      const or: Operand = {
        kind: 'expr',
        type: 'OR',
        left: { kind: 'expr', type: 'EQ', left: { kind: 'key', key: 'product' }, right: { kind: 'value', value: 'billing' } },
        right: { kind: 'expr', type: 'EQ', left: { kind: 'key', key: 'product' }, right: { kind: 'value', value: 'shipping' } },
      };
      const orJava = 'b.or(b.eq("product", "billing"), b.eq("product", "shipping"))';
      return {
        java: `        .filterExpression(b.and(\n                b.eq("audience", "CUSTOMER"),\n                ${grouped ? `b.group(${orJava})` : orJava}).build())\n`,
        expression: {
          kind: 'expr',
          type: 'AND',
          left: { kind: 'expr', type: 'EQ', left: { kind: 'key', key: 'audience' }, right: { kind: 'value', value: 'CUSTOMER' } },
          right: grouped ? { kind: 'group', content: or } : or,
        },
        skipped: [],
      };
    }
  }
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const INPUT =
  'code-mono w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[0.8rem] text-slate-800 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200';

export default function VectorSearchLab() {
  const [question, setQuestion] = useState(0);
  const [topK, setTopK] = useState(4);
  const [threshold, setThreshold] = useState(0);
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState("audience == 'CUSTOMER'");
  const [product, setProduct] = useState('billing');
  const [grouped, setGrouped] = useState(false);

  const built = useMemo(() => buildFilter(mode, text, product, grouped), [mode, text, product, grouped]);
  const sql = useMemo(() => {
    if (!built.expression) return { clause: null as string | null };
    try {
      return { clause: toPgVectorSql(built.expression) };
    } catch (e) {
      return { clause: null, error: e instanceof Error ? `IllegalStateException: ${e.message}` : String(e) };
    }
  }, [built]);
  const failed = Boolean(built.error || ('error' in sql && sql.error));

  const rows = useMemo(() => {
    const scores = QUESTIONS[question].scores;
    const path = sql.clause ? jsonPathOf(sql.clause) : null;
    const ranked = CHUNKS.map((chunk, i) => ({ chunk, score: scores[i] })).sort((a, b) => b.score - a.score);
    let returned = 0;
    return ranked.map((r) => {
      let status: Status;
      if (path && !matchesPgVector(path, r.chunk.metadata)) status = 'filtered';
      else if (!(1 - r.score < 1 - threshold)) status = 'threshold';
      else if (returned >= topK) status = 'topk';
      else {
        status = 'returned';
        returned++;
      }
      return { ...r, status };
    });
  }, [question, sql, threshold, topK]);

  const java = `SearchRequest request = SearchRequest.builder()
        .query(${quoteJava(QUESTIONS[question].text)})
${topK !== 4 ? `        .topK(${topK})\n` : ''}${threshold > 0 ? `        .similarityThreshold(${threshold.toFixed(2)})\n` : ''}${built.java}        .build();
List<Document> results = vectorStore.similaritySearch(request);`;

  const sqlText = `SELECT *, embedding <=> ? AS distance FROM public.vector_store
WHERE embedding <=> ? < ?${sql.clause ? `\n  AND ${sql.clause}` : ''}
ORDER BY distance LIMIT ?

-- ? = the question's embedding, < ${(1 - threshold).toFixed(2)} (1 - similarityThreshold), LIMIT ${topK}`;

  return (
    <LabFrame
      title="Similarity search and metadata filters"
      hint="Pick a question, then change topK, the threshold and the filter. The SQL is what PgVectorStore sends; the table shows which rows PostgreSQL returns."
    >
      <div className="flex flex-wrap gap-2">
        {QUESTIONS.map((q, i) => (
          <Pill key={q.text} active={question === i} onClick={() => setQuestion(i)}>
            {q.text}
          </Pill>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={`topK: ${topK}${topK === 4 ? ' (default)' : ''}`} htmlFor="vs-topk">
          <input id="vs-topk" type="range" min={1} max={8} value={topK} onChange={(e) => setTopK(+e.target.value)} className="w-full accent-brand-600" />
        </Field>
        <Field label={`similarityThreshold: ${threshold.toFixed(2)}${threshold === 0 ? ' (default: accept all)' : ''}`} htmlFor="vs-threshold">
          <input
            id="vs-threshold"
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(+e.target.value)}
            className="w-full accent-brand-600"
          />
        </Field>
      </div>

      <fieldset className="mt-4 min-w-0">
        <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">The filter</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <Pill key={m} active={mode === m} onClick={() => setMode(m)}>
              {MODES[m]}
            </Pill>
          ))}
        </div>
      </fieldset>

      <div className="mt-3">
        {mode === 'text' && (
          <>
            <label htmlFor="vs-filter" className="sr-only">
              Filter expression
            </label>
            <input id="vs-filter" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder="No filter" className={INPUT} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TEXT_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setText(p)}
                  className="code-mono rounded-full border border-slate-300 px-2.5 py-0.5 text-[0.75rem] text-slate-700 hover:border-brand-500 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
                >
                  {p || 'no filter'}
                </button>
              ))}
            </div>
          </>
        )}
        {(mode === 'concat' || mode === 'builder') && (
          <Field label="product, from the request" htmlFor="vs-product">
            <input id="vs-product" value={product} onChange={(e) => setProduct(e.target.value)} spellCheck={false} className={INPUT} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['billing', 'shipping', ATTACK].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProduct(p)}
                  className="code-mono rounded-full border border-slate-300 px-2.5 py-0.5 text-[0.75rem] text-slate-700 hover:border-brand-500 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>
        )}
        {mode === 'or' && (
          <div className="flex flex-wrap gap-2">
            <Pill active={!grouped} onClick={() => setGrouped(false)}>
              without b.group()
            </Pill>
            <Pill active={grouped} onClick={() => setGrouped(true)}>
              with b.group()
            </Pill>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <CodeView code={java} />
        <CodeView code={failed ? '-- The request fails before any SQL is sent.' : sqlText} />
      </div>

      <div className="mt-3 space-y-1 text-sm" aria-live="polite">
        {built.error && <p className="code-mono text-[0.8rem] text-rose-700 dark:text-rose-300">{built.error}</p>}
        {'error' in sql && sql.error && <p className="code-mono text-[0.8rem] text-rose-700 dark:text-rose-300">{sql.error}</p>}
        {built.skipped.length > 0 && (
          <p className="text-amber-800 dark:text-amber-300">
            The lexer skipped {built.skipped.map((s) => `"${s}"`).join(', ')} and the parse still succeeded, so the filter means something
            other than what it says. The only trace is a "token recognition error" on standard error.
          </p>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[0.8rem]">
          <thead className="text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <th className="w-px py-1 pr-3 font-medium">Score</th>
              <th className="py-1 pr-3 font-medium">Chunk</th>
              <th className="hidden py-1 pr-3 font-medium sm:table-cell">audience</th>
              <th className="hidden py-1 pr-3 font-medium sm:table-cell">product</th>
              <th className="w-px py-1 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.chunk.text}
                className={
                  'border-t border-slate-200 align-top dark:border-slate-700/70 ' +
                  (r.status === 'returned' && !failed ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500')
                }
              >
                <td className="code-mono py-1.5 pr-3">{r.score.toFixed(2)}</td>
                <td className="py-1.5 pr-3">
                  {r.chunk.text}
                  <span className="code-mono mt-0.5 block text-[0.7rem] sm:hidden">
                    <span className={r.chunk.metadata.audience === 'STAFF' && r.status === 'returned' && !failed ? 'font-semibold text-rose-700 dark:text-rose-300' : ''}>
                      {r.chunk.metadata.audience}
                    </span>
                    /{r.chunk.metadata.product}
                  </span>
                </td>
                <td className={'code-mono hidden py-1.5 pr-3 sm:table-cell ' + (r.chunk.metadata.audience === 'STAFF' && r.status === 'returned' && !failed ? 'font-semibold text-rose-700 dark:text-rose-300' : '')}>
                  {r.chunk.metadata.audience}
                </td>
                <td className="code-mono hidden py-1.5 pr-3 sm:table-cell">{r.chunk.metadata.product}</td>
                <td className={'py-1.5 whitespace-nowrap ' + (failed ? 'text-slate-500' : STATUS[r.status].className)}>{failed ? '—' : STATUS[r.status].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        The scores are made up for this example. Real ones come from your embedding model, and their range differs from model to model.
      </p>
    </LabFrame>
  );
}
