import { useEffect, useMemo, useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';
import { DEFAULT_SETTINGS, splitSteps, type Encoder, type SplitStep } from '../../lib/token-text-splitter';

/*
 * TokenTextSplitter from Spring AI 2.0.2, run in the browser. splitSteps() is a line-for-line port of doSplit, and the encoder is
 * cl100k_base (the splitter's default), so the chunks are the ones the Java class returns: checked against the jar on 144
 * text/setting combinations. Metadata follows TextSplitter: the parent's metadata plus parent_document_id, chunk_index and
 * total_chunks.
 */

const PARENT_ID = '3f2b9c1e-7a4d-4e8b-9c2f-1d6e5a8b7c90';

interface Sample {
  label: string;
  source: Record<string, string | number>;
  text: string;
}

const SAMPLES: Record<string, Sample> = {
  policy: {
    label: 'Refund policy',
    source: { charset: 'UTF-8', source: 'refund-policy.txt' },
    text: `Refunds

You can ask for a refund within 30 days of purchase. We send the money back to the original payment method, and most banks show it within 5 business days of our approval. If you paid by bank transfer, it can take up to 10 business days.

Gift cards can't be refunded or exchanged for cash. If a gift card was bought by mistake, contact support within 14 days and we will cancel it, as long as nobody has used it.

Annual plans are refunded in full during the first 30 days. After that, we refund the unused months, minus a 10% early-cancellation fee. Monthly plans are not refunded, but you can cancel at any time and keep access until the end of the month you paid for.

How do I ask for a refund? Open Billing, choose the invoice, and select Request refund. You will get an e-mail when we approve it! If the button is greyed out, the invoice is older than 30 days or was already refunded.`,
  },
  pdf: {
    label: 'A PDF page, as read',
    source: { page_number: 4, file_name: 'billing-handbook.pdf' },
    // The exact text PagePdfDocumentReader 2.0.2 returned for page 4 of a generated handbook, with the default config.
    text: "\n                  ACME   Billing  Handbook  - Customer  edition                                                                                                                                                       \n\n                  Refunds    are processed     within 5  business   days   of approval.                                                                                                                               \n                  Bank   transfers  can  take  up  to 10  business   days.                                                                                                                                            \n                  Gift cards  cannot   be  refunded.   Annual    plans  are  refunded   in full                                                                                                                       \n                  during  the first 30  days;  after that, unused    months    are  refunded                                                                                                                          \n                  minus   a 10%   fee.                                                                                                                                                                                \n\n                  Page 4 of 12                                                                                                                                                                                        \n",
  },
  api: {
    label: 'API notes',
    source: { charset: 'UTF-8', source: 'refunds-api.txt' },
    text: `Call the refunds endpoint with the invoice id. The request needs the billing:write scope.

POST /api/invoices/{id}/refunds
{"reason": "duplicate charge"}

The response is 202 Accepted. We e-mail the customer when the refund is approved. A second request for the same invoice returns 409 Conflict. Refunds over 500 USD wait for a manager, so they can take an extra day. Partial refunds take an amount field; leave it out to refund the whole invoice.`,
  },
};

function describe(step: SplitStep, minChunkSizeChars: number): string {
  if (step.dropped === 'blank') return 'Whitespace only';
  if (step.dropped === 'too-short') return `Not longer than minChunkLengthToEmbed (${DEFAULT_SETTINGS.minChunkLengthToEmbed} chars)`;
  switch (step.end) {
    case 'punctuation':
      return `Cut after the last ${step.mark === '\n' ? 'line break' : `"${step.mark}"`}`;
    case 'token-limit':
      return `Cut at the token limit: no punctuation after character ${minChunkSizeChars}`;
    case 'end-of-text':
      return 'The rest of the text fits';
    case 'remainder':
      return 'Left over after maxNumChunks chunks';
  }
}

function javaFor(chunkSize: number, minChunkSizeChars: number, keepSeparator: boolean): string {
  const lines = [
    chunkSize !== DEFAULT_SETTINGS.chunkSize && `        .withChunkSize(${chunkSize})`,
    minChunkSizeChars !== DEFAULT_SETTINGS.minChunkSizeChars && `        .withMinChunkSizeChars(${minChunkSizeChars})`,
    keepSeparator !== DEFAULT_SETTINGS.keepSeparator && `        .withKeepSeparator(${keepSeparator})`,
  ].filter(Boolean);
  return `TokenTextSplitter splitter = TokenTextSplitter.builder()
${lines.length ? lines.join('\n') + '\n' : ''}        .build();

List<Document> chunks = splitter.split(documents);`;
}

/** Shows line breaks, so you can see what keepSeparator changes. */
function Visible({ text }: { text: string }) {
  const parts = text.split('\n');
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <>
              <span className="text-brand-700 dark:text-brand-300" aria-label="line break">
                ↵
              </span>
              {'\n'}
            </>
          )}
        </span>
      ))}
    </>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; note: string }) {
  const id = `splitter-${props.label}`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
        <span className="code-mono">{props.label}</span>
        <span className="code-mono text-slate-900 dark:text-slate-100">{props.value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-brand-600"
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">{props.note}</p>
    </div>
  );
}

export default function TextSplitterLab() {
  const [encoder, setEncoder] = useState<Encoder | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [sample, setSample] = useState('policy');
  const [text, setText] = useState(SAMPLES.policy.text);
  const [chunkSize, setChunkSize] = useState(100);
  const [minChunkSizeChars, setMinChunkSizeChars] = useState(350);
  const [keepSeparator, setKeepSeparator] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all([import('js-tiktoken/lite'), import('js-tiktoken/ranks/cl100k_base')])
      .then(([{ Tiktoken }, ranks]) => {
        const tiktoken = new Tiktoken(ranks.default);
        if (live) setEncoder({ encode: (t) => tiktoken.encode(t), decode: (t) => tiktoken.decode(t) });
      })
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, []);

  const result = useMemo((): { steps: SplitStep[]; tokens: number } | { error: string } | null => {
    if (!encoder) return null;
    try {
      const steps = splitSteps(text, { ...DEFAULT_SETTINGS, chunkSize, minChunkSizeChars, keepSeparator }, encoder);
      return { steps, tokens: encoder.encode(text).length };
    } catch {
      // js-tiktoken, like jtokkit, refuses text that contains special tokens such as <|endoftext|>.
      return { error: 'The text contains a special token such as <|endoftext|>, which the encoder refuses, as jtokkit does.' };
    }
  }, [encoder, text, chunkSize, minChunkSizeChars, keepSeparator]);

  const pick = (key: string) => {
    setSample(key);
    setText(SAMPLES[key].text);
  };

  const kept = result && 'steps' in result ? result.steps.filter((s) => !s.dropped) : [];
  const parentMetadata = sample ? SAMPLES[sample].source : {};

  return (
    <LabFrame
      title="TokenTextSplitter"
      hint="Edit the text or pick a sample, then change the settings. The chunks below are the List<Document> the real splitter returns for this text."
    >
      <div className="flex flex-wrap gap-2">
        {Object.entries(SAMPLES).map(([key, s]) => (
          <Pill key={key} active={sample === key} onClick={() => pick(key)}>
            {s.label}
          </Pill>
        ))}
      </div>
      <label htmlFor="splitter-text" className="sr-only">
        Text to split
      </label>
      <textarea
        id="splitter-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSample('');
        }}
        rows={8}
        spellCheck={false}
        className="code-mono mt-3 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-[0.8rem] leading-relaxed text-slate-800 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Slider label="chunkSize" value={chunkSize} min={20} max={800} step={10} onChange={setChunkSize} note="Tokens per chunk, at most. Default 800." />
        <Slider
          label="minChunkSizeChars"
          value={minChunkSizeChars}
          min={0}
          max={600}
          step={10}
          onChange={setMinChunkSizeChars}
          note="A punctuation cut must come after this character. Default 350."
        />
        <fieldset className="min-w-0">
          <legend className="code-mono text-xs font-medium text-slate-600 dark:text-slate-400">keepSeparator</legend>
          <div className="mt-1.5 flex gap-2">
            <Pill active={keepSeparator} onClick={() => setKeepSeparator(true)}>
              true
            </Pill>
            <Pill active={!keepSeparator} onClick={() => setKeepSeparator(false)}>
              false
            </Pill>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">false replaces line breaks with spaces. Default true.</p>
        </fieldset>
      </div>

      <CodeView code={javaFor(chunkSize, minChunkSizeChars, keepSeparator)} lang="java" className="mt-4" />

      <div className="mt-5" aria-live="polite">
        {!result && !loadError && <p className="text-sm text-slate-500 dark:text-slate-400">Loading the cl100k_base tokenizer (about 1 MB)…</p>}
        {loadError && <p className="text-sm text-rose-700 dark:text-rose-300">The tokenizer didn't load. Check your connection and reload the page.</p>}
        {result && 'error' in result && <p className="text-sm text-rose-700 dark:text-rose-300">{result.error}</p>}
        {result && 'steps' in result && (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {result.tokens} tokens in, <strong className="font-semibold text-slate-900 dark:text-white">{kept.length} {kept.length === 1 ? 'chunk' : 'chunks'}</strong> out
              {result.steps.length > kept.length && `, ${result.steps.length - kept.length} dropped`}.
            </p>
            <ol className="mt-3 space-y-3">
              {result.steps.map((step, i) => {
                const index = kept.indexOf(step);
                const metadata = { ...parentMetadata, parent_document_id: PARENT_ID, chunk_index: index, total_chunks: kept.length };
                return (
                  <li
                    key={i}
                    className={
                      'rounded-md border p-3 ' +
                      (step.dropped ? 'border-dashed border-slate-300 opacity-70 dark:border-slate-700' : 'border-slate-200 dark:border-slate-700/70')
                    }
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="code-mono font-medium text-slate-800 dark:text-slate-200">{step.dropped ? 'Dropped' : `Document ${index}`}</span>
                      <span>
                        {step.consumedTokens} tokens, {step.text.length} chars
                      </span>
                      <span>{describe(step, minChunkSizeChars)}</span>
                    </div>
                    <pre className="code-mono mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[0.8rem] leading-relaxed text-slate-800 [overflow-wrap:anywhere] dark:text-slate-200">
                      <Visible text={step.text} />
                    </pre>
                    {!step.dropped && (
                      <p className="code-mono mt-2 whitespace-pre-wrap text-[0.75rem] text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">
                        metadata {JSON.stringify(metadata, null, 2)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </LabFrame>
  );
}
