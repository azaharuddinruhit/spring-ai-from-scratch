import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';
import { prettyJson } from '../../lib/json-format';

/*
 * Simulates .entity(Answer.class, spec -> …) in Spring AI 2.0.2 against OpenAI. The behaviour and every message come from the
 * real classes: ChatModelCallAdvisor appends getFormat() to the user message, or with useProviderStructuredOutput() sets
 * outputSchema (OpenAI sends json_schema with strict: true); StructuredOutputValidationAdvisor validates the raw reply text,
 * appends "Output JSON validation failed because of: …" and calls the model again, up to 3 more times, then hands the last
 * reply to the converter, which strips think tags and markdown fences before Jackson reads it.
 */

type Mode = 'prompt' | 'native';
type Reply = 'valid' | 'fenced' | 'missing' | 'prose';
type Outcome = { tone: 'ok' | 'warn' | 'error'; title: string; detail: string };

const QUESTION = 'Where is my refund for order 1042?';
const TEXT = 'Your refund for order 1042 was issued on 3 March. Banks take 5 to 7 business days to show it.';
// The replies are shown indented, as a model often writes them; whitespace changes nothing that is checked.
const VALID = prettyJson(`{"text":"${TEXT}","sources":["refund-policy.md"]}`);

const REPLIES: Record<Reply, { label: string; text: string; validation: string }> = {
  valid: { label: 'Valid JSON', text: VALID, validation: '' },
  fenced: {
    label: 'Wrapped in ```json',
    text: '```json\n' + VALID + '\n```',
    validation:
      "Invalid JSON: Unexpected character ('`' (code 96)): expected a valid value (JSON String, Number, Array, Object or token 'null', 'true' or 'false')",
  },
  missing: { label: 'Missing "sources"', text: prettyJson(`{"text":"${TEXT}"}`), validation: "required property 'sources' not found" },
  prose: {
    label: 'Prose before the JSON',
    text: `Sure! Here is the answer:\n${VALID}`,
    validation: "Invalid JSON: Unrecognized token 'Sure': was expecting (JSON String, Number, Array, Object or token 'null', 'true' or 'false')",
  },
};

const SCHEMA_STRICT = `{
  "$schema" : "https://json-schema.org/draft/2020-12/schema",
  "type" : "object",
  "properties" : {
    "sources" : {
      "type" : "array",
      "items" : {
        "type" : "string"
      }
    },
    "text" : {
      "type" : "string"
    }
  },
  "required" : [ "sources", "text" ],
  "additionalProperties" : false
}`;

const SCHEMA_NULLABLE = `{
  "$schema" : "https://json-schema.org/draft/2020-12/schema",
  "type" : "object",
  "properties" : {
    "note" : {
      "type" : "string"
    },
    "sources" : {
      "type" : "array",
      "items" : {
        "type" : "string"
      }
    },
    "text" : {
      "type" : "string"
    }
  },
  "required" : [ "sources", "text" ],
  "additionalProperties" : false
}`;

const MAX_REPEAT_ATTEMPTS = 3;

function javaFor(mode: Mode, validate: boolean, nullable: boolean): string {
  const record = nullable
    ? 'record Answer(String text, List<String> sources, @Nullable String note) {}'
    : 'record Answer(String text, List<String> sources) {}';
  const spec = [mode === 'native' && 'useProviderStructuredOutput()', validate && 'validateSchema()'].filter(Boolean).join('.');
  const entity = spec ? `.entity(Answer.class, spec -> spec.${spec});` : '.entity(Answer.class);';
  return `${record}

Answer answer = chatClient.prompt()
        .user("${QUESTION}")
        .call()
        ${entity}`;
}

function requestFor(mode: Mode, nullable: boolean): { title: string; body: string } {
  const schema = nullable ? SCHEMA_NULLABLE : SCHEMA_STRICT;
  if (mode === 'native') {
    const indented = schema.replace(/\n/g, '\n      ');
    return {
      title: 'OpenAI request (excerpt). The user message is sent unchanged.',
      body: `"response_format" : {
  "type" : "json_schema",
  "json_schema" : {
    "name" : "json_schema",
    "strict" : true,
    "schema" : ${indented}
  }
}`,
    };
  }
  return {
    title: 'The last user message, with getFormat() appended',
    body: `${QUESTION}
Your response should be in JSON format.
Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation.
Do not include markdown code blocks in your response.
Remove the \`\`\`json markdown from the output.
Here is the JSON Schema instance your output must adhere to:
\`\`\`${schema}\`\`\``,
  };
}

interface Attempt {
  reply: string;
  same: boolean;
  validation?: string;
}

function simulate(mode: Mode, validate: boolean, reply: Reply, repeats: boolean, nullable: boolean): { attempts: Attempt[]; outcome: Outcome } {
  if (mode === 'native' && nullable) {
    return {
      attempts: [],
      outcome: {
        tone: 'error',
        title: 'OpenAI rejects the request with HTTP 400',
        detail: 'Strict mode requires every property to be listed in "required". note is @Nullable, so the generated schema leaves it out, and entity() throws before any answer is produced.',
      },
    };
  }

  // Native strict decoding can only produce JSON that matches the schema, so the reply scenario doesn't apply.
  const chosen: Reply = mode === 'native' ? 'valid' : reply;
  const attempts: Attempt[] = [];
  let last: Reply = chosen;
  if (!validate) {
    attempts.push({ reply: REPLIES[chosen].text, same: false });
  } else {
    for (let i = 0; i <= MAX_REPEAT_ATTEMPTS; i++) {
      const current: Reply = i === 0 || repeats ? chosen : 'valid';
      const message = REPLIES[current].validation;
      attempts.push({ reply: REPLIES[current].text, same: i > 0 && current === chosen && chosen !== 'valid', validation: message });
      last = current;
      if (!message) break;
    }
  }

  const calls = attempts.length;
  const after = calls > 1 ? ` after ${calls} model calls` : '';
  return { attempts, outcome: outcomeFor(last, after) };
}

function outcomeFor(last: Reply, after: string): Outcome {
  switch (last) {
    case 'valid':
    case 'fenced':
      return {
        tone: 'ok',
        title: `Answer returned${after}`,
        detail:
          last === 'fenced'
            ? 'The converter strips the ```json fence before Jackson reads the text, so this reply converts fine.'
            : `Answer[text=${TEXT}, sources=[refund-policy.md]]`,
      };
    case 'missing':
      return {
        tone: 'warn',
        title: `Answer returned with sources = null${after}`,
        detail: 'Jackson leaves a missing record component null, and nothing reports it. The schema said sources is required; only validation checks that.',
      };
    case 'prose':
      return {
        tone: 'error',
        title: `entity() throws${after}`,
        detail: "tools.jackson.core.exc.StreamReadException: Unrecognized token 'Sure': was expecting (JSON String, Number, Array, Object or token 'null', 'true' or 'false')",
      };
  }
}

function Choice({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

const OUTCOME_STYLE: Record<Outcome['tone'], string> = {
  ok: 'border-brand-600/40 bg-brand-50 text-brand-900 dark:border-brand-400/30 dark:bg-brand-500/10 dark:text-brand-100',
  warn: 'border-amber-500/40 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100',
  error: 'border-rose-500/40 bg-rose-50 text-rose-900 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100',
};

export default function StructuredOutputLab() {
  const [mode, setMode] = useState<Mode>('prompt');
  const [validate, setValidate] = useState(false);
  const [reply, setReply] = useState<Reply>('missing');
  const [repeats, setRepeats] = useState(false);
  const [nullable, setNullable] = useState(false);

  const request = requestFor(mode, nullable);
  const { attempts, outcome } = simulate(mode, validate, reply, repeats, nullable);
  const replyApplies = mode === 'prompt';

  return (
    <LabFrame
      title="Prompt instructions, native schema and validation"
      hint="Choose how the schema reaches the model, whether replies are validated, and what the model sends back. The provider here is OpenAI."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice legend="How the schema reaches the model">
          <Pill active={mode === 'prompt'} onClick={() => setMode('prompt')}>
            Format text in the prompt
          </Pill>
          <Pill active={mode === 'native'} onClick={() => setMode('native')}>
            useProviderStructuredOutput()
          </Pill>
        </Choice>
        <Choice legend="Validation">
          <Pill active={!validate} onClick={() => setValidate(false)}>
            Off
          </Pill>
          <Pill active={validate} onClick={() => setValidate(true)}>
            validateSchema()
          </Pill>
        </Choice>
        <Choice legend="The record">
          <Pill active={!nullable} onClick={() => setNullable(false)}>
            All fields required
          </Pill>
          <Pill active={nullable} onClick={() => setNullable(true)}>
            One @Nullable field
          </Pill>
        </Choice>
        <Choice legend="The model's reply">
          {(Object.keys(REPLIES) as Reply[]).map((r) => (
            <Pill key={r} active={replyApplies && reply === r} onClick={() => setReply(r)}>
              {REPLIES[r].label}
            </Pill>
          ))}
        </Choice>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
        {replyApplies ? (
          validate &&
          reply !== 'valid' && (
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
              The model repeats the mistake on every retry
            </label>
          )
        ) : (
          <p>With native output, OpenAI's strict decoding only produces JSON that matches the schema, so the reply choice doesn't apply.</p>
        )}
      </div>

      <div className="mt-5 grid gap-5">
        <div className="min-w-0 space-y-4">
          <div>
            <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">Your code</h4>
            <CodeView code={javaFor(mode, validate, nullable)} lang="java" className="mt-1.5" />
          </div>
          <div>
            <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">{request.title}</h4>
            <CodeView code={request.body} className="mt-1.5 max-h-72 overflow-y-auto" />
          </div>
        </div>

        <div className="min-w-0">
          <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">What happens</h4>
          <ol className="mt-1.5 space-y-3">
            {attempts.map((a, i) => (
              <li key={i} className="rounded-md border border-slate-200 p-3 dark:border-slate-700/70">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Model call {i + 1}
                  {i > 0 && <span className="font-normal text-slate-500 dark:text-slate-400">, retry {i} of {MAX_REPEAT_ATTEMPTS}</span>}
                </p>
                {a.same ? (
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">The same reply again.</p>
                ) : (
                  <CodeView code={a.reply} className="mt-1.5 whitespace-pre-wrap [overflow-wrap:anywhere]" />
                )}
                {a.validation !== undefined && (
                  <p className={'mt-2 text-sm ' + (a.validation ? 'text-rose-700 dark:text-rose-300' : 'text-brand-700 dark:text-brand-300')}>
                    {a.validation ? (
                      <>
                        Validation failed: <span className="code-mono text-[0.8rem]">{a.validation}</span>
                        {i < MAX_REPEAT_ATTEMPTS
                          ? '. The advisor appends "Output JSON validation failed because of: …" to the user message and calls again.'
                          : '. No retries left, so the advisor returns this reply as it is.'}
                      </>
                    ) : (
                      'Validation passed.'
                    )}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <div role="status" aria-live="polite" className={'mt-3 rounded-md border p-3 ' + OUTCOME_STYLE[outcome.tone]}>
            <p className="font-medium">{outcome.title}</p>
            <p className="mt-1 text-sm break-words">{outcome.detail}</p>
          </div>
        </div>
      </div>
    </LabFrame>
  );
}
