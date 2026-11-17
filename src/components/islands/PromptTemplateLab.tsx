import { useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

type Delimiter = 'braces' | 'angles';

const DELIMITERS: Record<Delimiter, { open: string; close: string; pattern: RegExp }> = {
  braces: { open: '{', close: '}', pattern: /\{([A-Za-z_]\w*)\}/g },
  angles: { open: '<', close: '>', pattern: /<([A-Za-z_]\w*)>/g },
};

const DEFAULT_SYSTEM = `You are the support assistant for {product}.
Answer in a {tone} tone and always cite the ticket ID.`;
const DEFAULT_USER = 'Summarize ticket {ticketId} for the on-call engineer.';
const JSON_LINE = '\nReply as JSON: {"summary": "...", "severity": "P1|P2|P3"}';

const SAMPLE_VALUES: Record<string, string> = { product: 'Acme Pay', tone: 'calm, precise', ticketId: 'INC-4821' };

function variablesIn(text: string, delimiter: Delimiter): string[] {
  return [...text.matchAll(DELIMITERS[delimiter].pattern)].map((m) => m[1]);
}

/** Mimics StringTemplate: with { } delimiters, a brace that doesn't wrap a bare identifier is a syntax error. */
function parseError(text: string, delimiter: Delimiter): string | null {
  if (delimiter !== 'braces') return null;
  const stray = text.replace(DELIMITERS.braces.pattern, '').match(/[{}]/);
  return stray
    ? `StringTemplate syntax error near '${stray[0]}'. Literal JSON braces collide with the { } delimiters. Escape them, or switch the renderer to < >.`
    : null;
}

function render(text: string, delimiter: Delimiter, values: Record<string, string>): string {
  return text.replace(DELIMITERS[delimiter].pattern, (_, name: string) => values[name] ?? '');
}

function quote(text: string): string {
  return text.includes('\n') ? `"""\n            ${text.replaceAll('\n', '\n            ')}"""` : JSON.stringify(text);
}

export default function PromptTemplateLab() {
  const [delimiter, setDelimiter] = useState<Delimiter>('braces');
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [user, setUser] = useState(DEFAULT_USER);
  const [values, setValues] = useState<Record<string, string>>(SAMPLE_VALUES);
  const [attachImage, setAttachImage] = useState(true);

  const systemVars = variablesIn(system, delimiter);
  const userVars = variablesIn(user, delimiter);
  const allVars = [...new Set([...systemVars, ...userVars])];
  const missing = allVars.filter((v) => !values[v]?.trim());
  const syntaxError = parseError(system, delimiter) ?? parseError(user, delimiter);
  const error = syntaxError ?? (missing.length > 0 ? `IllegalStateException: Not all variables were replaced in the template. Missing variable names are: [${missing.join(', ')}].` : null);

  function switchDelimiter(next: Delimiter) {
    const from = DELIMITERS[delimiter];
    const to = DELIMITERS[next];
    const convert = (text: string) => text.replace(from.pattern, (_, name: string) => `${to.open}${name}${to.close}`);
    setSystem(convert(system));
    setUser(convert(user));
    setDelimiter(next);
  }

  const params = (vars: string[]) => vars.map((v) => `.param("${v}", ${JSON.stringify(values[v] ?? '')})`).join('');
  const java = `chatClient.prompt()${
    delimiter === 'angles'
      ? `
        .templateRenderer(StTemplateRenderer.builder()
                .startDelimiterToken('<')
                .endDelimiterToken('>')
                .build())`
      : ''
  }
        .system(s -> s.text(systemTemplate)   // classpath:/prompts/support-system.st
                ${params(systemVars)})
        .user(u -> u.text(${quote(user)})
                ${params(userVars)}${attachImage ? `\n                .media(MimeTypeUtils.IMAGE_PNG, screenshot)` : ''})
        .call()
        .content();`;

  return (
    <LabFrame
      title="Prompt template playground"
      hint="Edit the .st templates, fill in the variables, and inspect the Prompt that reaches the model. Try the JSON preset to see why delimiters matter."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Delimiters:</span>
        <Pill active={delimiter === 'braces'} onClick={() => switchDelimiter('braces')}>
          {'{name}'} (default)
        </Pill>
        <Pill active={delimiter === 'angles'} onClick={() => switchDelimiter('angles')}>
          {'<name>'}
        </Pill>
        <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
        <Pill active={system.includes('Reply as JSON')} onClick={() => setSystem(system.includes('Reply as JSON') ? system.replace(JSON_LINE, '') : system + JSON_LINE)}>
          + JSON instructions
        </Pill>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input type="checkbox" className="accent-brand-600" checked={attachImage} onChange={(e) => setAttachImage(e.target.checked)} />
          attach screenshot.png
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block">
            <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">prompts/support-system.st</span>
            <textarea
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              rows={4}
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-900 focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="block">
            <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">user template</span>
            <textarea
              value={user}
              onChange={(e) => setUser(e.target.value)}
              rows={2}
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-xs text-slate-900 focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <fieldset className="min-w-0 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Variables found ({allVars.length})</legend>
            {allVars.length === 0 && <p className="text-xs text-slate-400">No variables in either template.</p>}
            <div className="space-y-2">
              {allVars.map((v) => (
                <label key={v} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 font-mono text-slate-600 dark:text-slate-400">{v}</span>
                  <input
                    value={values[v] ?? ''}
                    onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                    placeholder="missing"
                    className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 placeholder:text-rose-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700" aria-live="polite">
            <p className="font-mono text-[0.7rem] font-semibold text-slate-500 uppercase">Prompt.getInstructions()</p>
            {error ? (
              <p className="mt-2 rounded bg-rose-50 p-2 font-mono text-[0.72rem] text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
            ) : (
              <ol className="mt-2 space-y-2">
                <li className="rounded border-l-4 border-sky-500 bg-slate-50 p-2 dark:bg-slate-800/60">
                  <p className="font-mono text-[0.68rem] font-semibold text-sky-700 dark:text-sky-300">SystemMessage</p>
                  <p className="mt-1 font-mono text-[0.72rem] whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                    {render(system, delimiter, values)}
                  </p>
                </li>
                <li className="rounded border-l-4 border-brand-500 bg-slate-50 p-2 dark:bg-slate-800/60">
                  <p className="font-mono text-[0.68rem] font-semibold text-brand-700 dark:text-brand-300">UserMessage</p>
                  <p className="mt-1 font-mono text-[0.72rem] whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                    {render(user, delimiter, values)}
                  </p>
                  {attachImage && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded bg-white px-1.5 py-0.5 font-mono text-[0.68rem] text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                      🖼 Media(mimeType=image/png, data=class path resource [tickets/screenshot.png])
                    </p>
                  )}
                </li>
              </ol>
            )}
          </div>
          <CodeView code={java} />
        </div>
      </div>
    </LabFrame>
  );
}
