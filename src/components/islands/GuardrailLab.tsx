import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * A support conversation through SafeGuardAdvisor, a PII redaction advisor, MessageChatMemoryAdvisor and SimpleLoggerAdvisor,
 * as Spring AI 2.0.2 runs them. Checked against the real classes:
 * - SafeGuardAdvisor lower-cases Prompt.getContents() (every message, system and history included) and each sensitive word with
 *   Locale.ROOT and blocks on String.contains, so it matches inside other words. A blocked call never reaches the model and gets
 *   the fixed failure response below. Its default order is 0.
 * - MessageChatMemoryAdvisor (HIGHEST_PRECEDENCE + 200) sends the stored window plus the new message, saves the new message as it
 *   reached it and saves the reply on the way back, so whatever runs before it decides what is stored. MessageWindowChatMemory
 *   trims to the newest maxMessages messages when it saves.
 * - Advisors that share an order run in reverse registration order.
 * The redaction patterns are the ones in PiiRedactionAdvisor in the lesson.
 */

const HIGHEST = -2147483648;
const FAILURE = "I'm unable to respond to that due to sensitive content. Could we rephrase or discuss something else?";
const SYSTEM_TEXT = 'You are the support assistant for Acme Cloud.';
const WINDOW = 6;

const SUGGESTIONS = [
  'I forgot my password',
  'What is a classname?',
  'Card 4111 1111 1111 1111 was charged twice',
  'Send the invoice to ada@example.com',
  'Can you help with my invoice?',
];

const RULES: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\b(?:\d[ -]?){12,18}\d\b/g, '[card]'],
];

function redact(text: string): string {
  return RULES.reduce((t, [pattern, replacement]) => t.replace(pattern, replacement), text);
}

type Role = 'system' | 'user' | 'assistant';
type Msg = { role: Role; text: string };

type GuardOrder = 'default' | 'outer';
type Redaction = 'off' | 'before' | 'after';

const GUARD_ORDER: Record<GuardOrder, number> = { default: 0, outer: HIGHEST + 25 };
const REDACTION_ORDER: Record<Exclude<Redaction, 'off'>, number> = { before: HIGHEST + 100, after: HIGHEST + 250 };

interface Block {
  word: string;
  where: 'system' | 'history' | 'user';
  text: string;
}

interface Turn {
  user: string;
  reply: string;
  block: Block | null;
  modelSaw: Msg[] | null;
}

interface Config {
  words: string[];
  guard: GuardOrder;
  redaction: Redaction;
}

type AdvisorId = 'guard' | 'redact' | 'memory' | 'logger';

function chainFor(config: Config): AdvisorId[] {
  const registered: { id: AdvisorId; order: number }[] = [
    { id: 'guard', order: GUARD_ORDER[config.guard] },
    ...(config.redaction === 'off' ? [] : [{ id: 'redact' as const, order: REDACTION_ORDER[config.redaction] }]),
    { id: 'memory', order: HIGHEST + 200 },
    { id: 'logger', order: 0 },
  ];
  return registered
    .map((a, index) => ({ ...a, index }))
    .sort((a, b) => a.order - b.order || b.index - a.index)
    .map((a) => a.id);
}

function findBlock(prompt: Msg[], words: string[], userText: string): Block | null {
  const contents = prompt.map((m) => m.text).join('').toLowerCase();
  const word = words.find((w) => contents.includes(w.toLowerCase()));
  if (!word) return null;
  const lower = word.toLowerCase();
  const hit = prompt.find((m) => m.text.toLowerCase().includes(lower));
  if (!hit) return { word, where: 'user', text: userText };
  const where = hit.role === 'system' ? 'system' : hit.text === userText && hit === prompt[prompt.length - 1] ? 'user' : 'history';
  return { word, where, text: hit.text };
}

interface Outcome {
  turn: Turn;
  memory: Msg[];
  log: string[];
}

function send(text: string, memoryBefore: Msg[], config: Config, modelCalls: number): Outcome {
  const chain = chainFor(config);
  const memory = [...memoryBefore];
  const log: string[] = [];
  let block: Block | null = null;
  let modelSaw: Msg[] | null = null;

  const keepWindow = () => memory.splice(0, Math.max(0, memory.length - WINDOW));

  function run(i: number, prompt: Msg[]): string {
    if (i === chain.length) {
      modelSaw = prompt;
      return `Model answer ${modelCalls + 1}.`;
    }
    switch (chain[i]) {
      case 'guard': {
        block = findBlock(prompt, config.words, prompt[prompt.length - 1].text);
        return block ? FAILURE : run(i + 1, prompt);
      }
      case 'redact':
        return run(
          i + 1,
          prompt.map((m, k) => (k === prompt.length - 1 && m.role === 'user' ? { ...m, text: redact(m.text) } : m)),
        );
      case 'memory': {
        // The prompt is the stored window plus the new message; the window is trimmed when the message is saved.
        const message = prompt[prompt.length - 1];
        const next = [...prompt.filter((m) => m.role === 'system'), ...memory, message];
        memory.push(message);
        keepWindow();
        const reply = run(i + 1, next);
        memory.push({ role: 'assistant', text: reply });
        keepWindow();
        return reply;
      }
      case 'logger': {
        log.push(`request: "${prompt[prompt.length - 1].text}"`);
        const reply = run(i + 1, prompt);
        log.push(`response: "${reply}"`);
        return reply;
      }
    }
  }

  const reply = run(0, [
    { role: 'system', text: SYSTEM_TEXT },
    { role: 'user', text },
  ]);
  return { turn: { user: text, reply, block, modelSaw }, memory, log };
}

function javaFor(config: Config): string {
  const words = config.words.map((w) => `"${w}"`).join(', ');
  const guardOrder = config.guard === 'outer' ? '\n                                .order(Ordered.HIGHEST_PRECEDENCE + 25)' : '';
  const redaction =
    config.redaction === 'off' ? '' : `\n                        new PiiRedactionAdvisor(), // ${config.redaction === 'before' ? 'HIGHEST_PRECEDENCE + 100' : 'HIGHEST_PRECEDENCE + 250'}`;
  return `builder.defaultSystem("${SYSTEM_TEXT}")
        .defaultAdvisors(
                SafeGuardAdvisor.builder()
                                .sensitiveWords(List.of(${words}))${guardOrder}
                                .build(),${redaction}
                // chatMemory is a MessageWindowChatMemory with maxMessages(${WINDOW})
                MessageChatMemoryAdvisor.builder(chatMemory).build(),
                new SimpleLoggerAdvisor())`;
}

function Highlight({ text, word }: { text: string; word: string }) {
  const at = text.toLowerCase().indexOf(word.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-rose-200 px-0.5 text-rose-950 dark:bg-rose-500/30 dark:text-rose-100">{text.slice(at, at + word.length)}</mark>
      {text.slice(at + word.length)}
    </>
  );
}

const WHERE: Record<Block['where'], string> = {
  user: 'in this message',
  history: 'in an earlier message that memory added to the prompt',
  system: 'in the system message',
};

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 p-3 dark:border-slate-700/70">
      <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">{title}</h4>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Messages({ messages, empty }: { messages: Msg[]; empty: string }) {
  if (!messages.length) return <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>;
  return (
    <ol className="space-y-1.5">
      {messages.map((m, i) => (
        <li key={i} className="flex gap-2 text-sm leading-snug">
          <span className="code-mono w-16 shrink-0 text-[0.75rem] uppercase text-slate-500 dark:text-slate-400">{m.role}</span>
          <span className="min-w-0 [overflow-wrap:anywhere] text-slate-700 dark:text-slate-300">{m.text}</span>
        </li>
      ))}
    </ol>
  );
}

export default function GuardrailLab() {
  const [wordsText, setWordsText] = useState('password, ssn');
  const [guard, setGuard] = useState<GuardOrder>('default');
  const [redaction, setRedaction] = useState<Redaction>('off');
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [memory, setMemory] = useState<Msg[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const words = wordsText
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
  const config: Config = { words, guard, redaction };
  const modelCalls = turns.filter((t) => t.modelSaw).length;
  const lastModelCall = [...turns].reverse().find((t) => t.modelSaw)?.modelSaw ?? [];

  const submit = (text: string) => {
    const message = text.trim();
    if (!message) return;
    const outcome = send(message, memory, config, modelCalls);
    setTurns((t) => [...t, outcome.turn]);
    setMemory(outcome.memory);
    setLog((l) => [...l, ...outcome.log]);
    setDraft('');
  };

  const reset = () => {
    setTurns([]);
    setMemory([]);
    setLog([]);
  };

  return (
    <LabFrame
      title="SafeGuard, redaction and memory"
      hint="Pick the advisor orders, then chat. Each message goes through the advisors in order, and memory keeps the last 6 messages."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Sensitive words, separated by commas</span>
          <input
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
            className="code-mono mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">SafeGuardAdvisor order</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={guard === 'default'} onClick={() => setGuard('default')}>
              0 (default)
            </Pill>
            <Pill active={guard === 'outer'} onClick={() => setGuard('outer')}>
              HIGHEST_PRECEDENCE + 25
            </Pill>
          </div>
        </fieldset>
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">PiiRedactionAdvisor</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={redaction === 'off'} onClick={() => setRedaction('off')}>
              Off
            </Pill>
            <Pill active={redaction === 'before'} onClick={() => setRedaction('before')}>
              + 100, before memory
            </Pill>
            <Pill active={redaction === 'after'} onClick={() => setRedaction('after')}>
              + 250, after memory
            </Pill>
          </div>
        </fieldset>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">Your configuration</h4>
        <CodeView code={javaFor(config)} lang="java" className="mt-1.5" />
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
          className="flex gap-2">
          <label className="sr-only" htmlFor="guardrail-message">
            Message
          </label>
          <input
            id="guardrail-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message"
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          <button
            type="submit"
            className="rounded-md border border-brand-600 bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-700 dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-100"
          >
            Send
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!turns.length}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:text-brand-700 disabled:opacity-40 dark:text-slate-400"
          >
            Clear
          </button>
        </form>

        <div role="log" aria-live="polite" className="space-y-2">
          {turns.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Send a message or pick one above.</p>}
          {turns.map((t, i) => (
            <div key={i} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700/70">
              <p className="text-slate-800 [overflow-wrap:anywhere] dark:text-slate-200">
                <span className="font-medium">You: </span>
                {t.user}
              </p>
              <p className={'mt-1 [overflow-wrap:anywhere] ' + (t.block ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300')}>
                <span className="font-medium">Assistant: </span>
                {t.reply}
              </p>
              {t.block && (
                <p className="mt-1.5 text-xs text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">
                  SafeGuardAdvisor matched "{t.block.word}" {WHERE[t.block.where]}: <Highlight text={t.block.text} word={t.block.word} />. The model was not
                  called.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Panel title={`Conversation in ChatMemory (${memory.length} of ${WINDOW})`}>
            <Messages messages={memory} empty="Nothing stored." />
          </Panel>
          <Panel title="What the model received last">
            <Messages messages={lastModelCall} empty="The model hasn't been called." />
          </Panel>
        </div>
        <Panel title="SimpleLoggerAdvisor output">
          {log.length ? (
            <ol className="code-mono max-h-48 space-y-1 overflow-y-auto text-[0.75rem] text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing logged yet.</p>
          )}
        </Panel>
      </div>
    </LabFrame>
  );
}
