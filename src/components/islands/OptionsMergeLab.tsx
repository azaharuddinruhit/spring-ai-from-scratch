import { useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

type Field = 'model' | 'temperature' | 'maxTokens';
type Layer = Record<Field, string | null>;
type Mode = 'chatClient' | 'chatModel';
type Source = 'request' | 'client' | 'model' | 'none';

const FIELDS: Field[] = ['model', 'temperature', 'maxTokens'];

const MODEL_DEFAULTS: Layer = { model: 'claude-haiku-4-5', temperature: '0.7', maxTokens: '4096' };

const SOURCE_STYLE: Record<Source, { label: string; className: string }> = {
  request: { label: '.options(...) on the request', className: 'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200' },
  client: { label: 'ChatClient defaultOptions', className: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200' },
  model: { label: 'application.yml (model defaults)', className: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  none: { label: 'unset → provider API default', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200' },
};

interface LogEntry {
  call: string;
  outcome: string;
  ok: boolean;
}

function resolve(mode: Mode, client: Layer, request: Layer): Record<Field, { value: string | null; source: Source }> {
  const requestHasOptions = FIELDS.some((f) => request[f] !== null);
  return Object.fromEntries(
    FIELDS.map((f) => {
      if (mode === 'chatModel') {
        // ChatModel.call(Prompt) doesn't merge: a non-null Prompt options object is used as-is.
        if (!requestHasOptions) return [f, { value: MODEL_DEFAULTS[f], source: 'model' }];
        return [f, request[f] !== null ? { value: request[f], source: 'request' } : { value: null, source: 'none' }];
      }
      if (request[f] !== null) return [f, { value: request[f], source: 'request' }];
      if (client[f] !== null) return [f, { value: client[f], source: 'client' }];
      return [f, { value: MODEL_DEFAULTS[f], source: 'model' }];
    }),
  ) as Record<Field, { value: string | null; source: Source }>;
}

function builderLines(layer: Layer, indent: string): string {
  return FIELDS.filter((f) => layer[f] !== null)
    .map((f) => `${indent}.${f}(${f === 'model' ? `"${layer[f]}"` : layer[f]})`)
    .join('\n');
}

function javaFor(mode: Mode, client: Layer, request: Layer): string {
  const requestLines = builderLines(request, '            ');
  if (mode === 'chatModel') {
    return requestLines
      ? `ChatResponse response = chatModel.call(new Prompt(
        "Summarize ticket INC-4821",
        AnthropicChatOptions.builder()
${requestLines}
            .build()));`
      : `// No options on the Prompt: the model's defaults apply
ChatResponse response = chatModel.call(new Prompt("Summarize ticket INC-4821"));`;
  }
  const clientLines = builderLines(client, '            ');
  const clientCode = clientLines
    ? `ChatClient chatClient = builder
        .defaultOptions(AnthropicChatOptions.builder()
${clientLines})
        .build();`
    : 'ChatClient chatClient = builder.build();';
  const requestCode = requestLines
    ? `String answer = chatClient.prompt("Summarize ticket INC-4821")
        .options(AnthropicChatOptions.builder()   // a builder, not built options
${requestLines})
        .call()
        .content();`
    : `String answer = chatClient.prompt("Summarize ticket INC-4821")
        .call()
        .content();`;
  return `${clientCode}\n\n${requestCode}`;
}

function LayerEditor({
  title,
  layer,
  onChange,
  disabled,
}: {
  title: string;
  layer: Layer;
  onChange: (next: Layer) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 rounded-lg border border-slate-200 p-3 disabled:opacity-40 dark:border-slate-700"
    >
      <legend className="px-1 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{title}</legend>
      <div className="space-y-2">
        {FIELDS.map((f) => (
          <label key={f} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="accent-brand-600"
              checked={layer[f] !== null}
              onChange={(e) => onChange({ ...layer, [f]: e.target.checked ? MODEL_DEFAULTS[f] : null })}
            />
            <span className="w-20 font-mono text-slate-600 dark:text-slate-400">{f}</span>
            <input
              className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
              value={layer[f] ?? ''}
              placeholder="unset"
              disabled={layer[f] === null}
              onChange={(e) => onChange({ ...layer, [f]: e.target.value })}
              aria-label={`${title} ${f}`}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function OptionsMergeLab() {
  const [mode, setMode] = useState<Mode>('chatClient');
  const [client, setClient] = useState<Layer>({ model: null, temperature: '0.2', maxTokens: null });
  const [request, setRequest] = useState<Layer>({ model: null, temperature: null, maxTokens: '256' });
  const [log, setLog] = useState<LogEntry[]>([]);

  const effective = resolve(mode, client, request);
  const record = (entry: LogEntry) => setLog((prev) => [entry, ...prev].slice(0, 4));

  return (
    <LabFrame
      title="ChatOptions merge & immutability inspector"
      hint="Set options at each layer and compare how ChatClient and ChatModel resolve them. Then try to change an options object in place."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Entry point:</span>
        <Pill active={mode === 'chatClient'} onClick={() => setMode('chatClient')}>
          chatClient.prompt()…
        </Pill>
        <Pill active={mode === 'chatModel'} onClick={() => setMode('chatModel')}>
          chatModel.call(prompt)
        </Pill>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <fieldset className="min-w-0 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <legend className="px-1 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">application.yml</legend>
          <dl className="space-y-2 text-xs">
            {FIELDS.map((f) => (
              <div key={f} className="flex gap-2">
                <dt className="w-20 font-mono text-slate-500">{f}</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100">{MODEL_DEFAULTS[f]}</dd>
              </div>
            ))}
          </dl>
        </fieldset>
        <LayerEditor title="ChatClient defaultOptions" layer={client} onChange={setClient} disabled={mode === 'chatModel'} />
        <LayerEditor title={mode === 'chatClient' ? '.options(builder)' : 'Prompt options'} layer={request} onChange={setRequest} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Option</th>
              <th className="px-3 py-2 font-medium">Value sent to the provider</th>
              <th className="px-3 py-2 font-medium">Where it came from</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => (
              <tr key={f} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{f}</td>
                <td className="px-3 py-2 font-mono font-semibold text-slate-900 dark:text-white">{effective[f].value ?? 'null'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[0.7rem] font-medium ${SOURCE_STYLE[effective[f].source].className}`}>
                    {SOURCE_STYLE[effective[f].source].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mode === 'chatModel' && FIELDS.some((f) => request[f] !== null) && FIELDS.some((f) => request[f] === null) && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          ChatModel.call(Prompt) doesn't merge. The Prompt's options replace the model defaults entirely, so any option you
          leave unset falls back to the provider's own default, not to your application.yml.
        </p>
      )}

      <CodeView className="mt-4" code={javaFor(mode, client, request)} lang="java" />

      <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Try to change an options object</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill
            active={false}
            onClick={() =>
              record({
                call: 'options.getStopSequences().add("END")',
                outcome: 'java.lang.UnsupportedOperationException: collections in 2.x options are unmodifiable',
                ok: false,
              })
            }
          >
            getStopSequences().add(…)
          </Pill>
          <Pill
            active={false}
            onClick={() =>
              record({
                call: 'options.copy()',
                outcome: 'error: cannot find symbol: copy(). It was removed in 2.0; use mutate() instead',
                ok: false,
              })
            }
          >
            copy()
          </Pill>
          <Pill
            active={false}
            onClick={() =>
              record({
                call: 'var strict = options.mutate().temperature(0.0).build()',
                outcome: `New instance: temperature=0.0. The original options object still has temperature=${effective.temperature.value ?? 'null'}`,
                ok: true,
              })
            }
          >
            mutate()…build()
          </Pill>
        </div>
        <ul className="mt-3 space-y-1.5 font-mono text-[0.72rem]" aria-live="polite">
          {log.length === 0 && <li className="text-slate-400">Results appear here.</li>}
          {log.map((entry, i) => (
            <li key={log.length - i} className="rounded bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
              <span className="text-slate-500">jshell&gt; {entry.call}</span>
              <br />
              <span className={entry.ok ? 'text-brand-700 dark:text-brand-300' : 'text-rose-700 dark:text-rose-300'}>{entry.outcome}</span>
            </li>
          ))}
        </ul>
      </div>
    </LabFrame>
  );
}
