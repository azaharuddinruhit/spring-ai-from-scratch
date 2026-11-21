import { useEffect, useRef, useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

type Terminal = 'content' | 'chatResponse' | 'entity' | 'stream';

const TERMINALS: Record<Terminal, { label: string; code: string; returns: string }> = {
  content: { label: '.call().content()', code: '.call()\n        .content();', returns: 'String' },
  chatResponse: { label: '.call().chatResponse()', code: '.call()\n        .chatResponse();', returns: 'ChatResponse' },
  entity: {
    label: '.call().entity(SuggestedReply.class)',
    code: '.call()\n        .entity(SuggestedReply.class);',
    returns: 'SuggestedReply',
  },
  stream: { label: '.stream().content()', code: '.stream()\n        .content();', returns: 'Flux<String>' },
};

// An invented reply to the message in the code below.
const ANSWER = 'Sorry about the double charge on order A-1077. An agent will check the payment and confirm the next steps by email.';
const TOKENS = [
  'Sorry', ' about', ' the', ' double', ' charge', ' on', ' order', ' A', '-1077', '.', ' An', ' agent', ' will', ' check', ' the',
  ' payment', ' and', ' confirm', ' the', ' next', ' steps', ' by', ' email', '.',
];

interface Stage {
  id: string;
  name: string;
  detail: string;
}

function stagesFor(logger: boolean, terminal: Terminal): Stage[] {
  return [
    { id: 'service', name: 'ReplyService', detail: 'Your @Service builds the request through the fluent API.' },
    { id: 'client', name: 'DefaultChatClient', detail: 'Collects the system/user text, options and advisors, then builds a ChatClientRequest.' },
    {
      id: 'tools',
      name: 'ToolCallingAdvisor',
      detail: 'Registered automatically at HIGHEST_PRECEDENCE + 300, so it wraps every advisor ordered after it, here the logger. No tools are attached, so it makes a single pass.',
    },
    ...(logger
      ? [{ id: 'logger', name: 'SimpleLoggerAdvisor', detail: 'Order 0. Logs the request at DEBUG on the way in and the response on the way out.' }]
      : []),
    {
      id: 'model',
      name: terminal === 'stream' ? 'ChatModelStreamAdvisor → AnthropicChatModel' : 'ChatModelCallAdvisor → AnthropicChatModel',
      detail: {
        content: 'The last link in the chain calls ChatModel.call(prompt).',
        chatResponse: 'The last link in the chain calls ChatModel.call(prompt).',
        entity:
          'Adds a JSON Schema for the SuggestedReply record as format instructions on the prompt, then calls ChatModel.call(prompt). On the way back, BeanOutputConverter parses the JSON into a SuggestedReply.',
        stream: 'The last link in the chain calls ChatModel.stream(prompt), which returns a Flux<ChatResponse>.',
      }[terminal],
    },
    { id: 'provider', name: 'Anthropic Messages API', detail: 'HTTPS request carrying model, max_tokens and messages.' },
  ];
}

export default function ChatClientLifecycle() {
  const [terminal, setTerminal] = useState<Terminal>('content');
  const [logger, setLogger] = useState(true);
  const [step, setStep] = useState(-1); // index into the request/response timeline, -1 = idle
  const [tokenCount, setTokenCount] = useState(0);
  const timer = useRef<number | null>(null);

  const stages = stagesFor(logger, terminal);
  // Timeline: down through every stage, then back up from the stage just above the provider.
  const timeline = [
    ...stages.map((_, i) => ({ index: i, dir: 'down' as const })),
    ...stages.slice(0, -1).map((_, i) => ({ index: stages.length - 2 - i, dir: 'up' as const })),
  ];
  const done = step >= timeline.length;
  const current = step >= 0 && !done ? timeline[step] : null;

  useEffect(() => () => stop(), []);

  function stop() {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }

  function reset() {
    stop();
    setStep(-1);
    setTokenCount(0);
  }

  function send() {
    reset();
    let i = 0;
    setStep(0);
    timer.current = window.setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= timeline.length) stop();
    }, 520);
  }

  // Streaming: tokens arrive while the response travels back up the chain.
  useEffect(() => {
    if (terminal !== 'stream' || !current || current.dir !== 'up') return;
    setTokenCount((n) => Math.min(TOKENS.length, n + Math.ceil(TOKENS.length / (stages.length - 1))));
  }, [step]);

  const visibleTokens = terminal === 'stream' ? (done ? TOKENS.length : tokenCount) : 0;

  const java = `record SuggestedReply(
        String reply,
        boolean needsAgent
) {}

String message = "I was charged twice for A-1077.";

${TERMINALS[terminal].returns} result = chatClient.prompt()
        .user(u -> u.text("<message>{message}</message>")
                .param("message", message))
        ${TERMINALS[terminal].code}`;

  return (
    <LabFrame
      title="ChatClient request lifecycle"
      hint="Pick a terminal operation and press Send to follow the request down the advisor chain to the provider and back."
    >
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TERMINALS) as Terminal[]).map((t) => (
          <Pill
            key={t}
            active={terminal === t}
            onClick={() => {
              setTerminal(t);
              reset();
            }}
          >
            {TERMINALS[t].label}
          </Pill>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="accent-brand-600"
            checked={logger}
            onChange={(e) => {
              setLogger(e.target.checked);
              reset();
            }}
          />
          defaultAdvisors(new SimpleLoggerAdvisor())
        </label>
        <button
          type="button"
          onClick={send}
          className="ml-auto rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          disabled={step >= 0 && !done}
        >
          {done ? 'Send again' : 'Send'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="space-y-1.5">
          {stages.map((stage, i) => {
            const active = current?.index === i;
            const visited = step >= 0 && (done || timeline.slice(0, step + 1).some((t) => t.index === i));
            return (
              <li
                key={stage.id}
                className={
                  'rounded-lg border px-3 py-2 transition-all ' +
                  (active
                    ? 'border-brand-500 bg-brand-50 shadow-sm dark:bg-brand-500/10'
                    : visited
                      ? 'border-slate-300 dark:border-slate-700'
                      : 'border-slate-200 opacity-70 dark:border-slate-800')
                }
                style={{ marginLeft: `${Math.min(i, 5) * 0.6}rem` }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{stage.name}</span>
                  {active && (
                    <span className="ml-auto font-mono text-[0.65rem] font-semibold text-brand-700 dark:text-brand-300">
                      {current?.dir === 'down' ? '↓ request' : '↑ response'}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[0.72rem] text-slate-500 dark:text-slate-400">{stage.detail}</p>
              </li>
            );
          })}
        </ol>

        <div className="space-y-3">
          <CodeView code={java} lang="java" />
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="font-mono text-[0.7rem] font-semibold text-slate-500 uppercase">
              result : {TERMINALS[terminal].returns}
            </p>
            <div className="mt-2 min-h-24 font-mono text-[0.75rem] text-slate-800 dark:text-slate-200" aria-live="polite">
              {!done && terminal !== 'stream' && <span className="text-slate-400">{step < 0 ? 'Press Send.' : 'Waiting for the response…'}</span>}
              {terminal === 'stream' && step < 0 && <span className="text-slate-400">Press Send.</span>}
              {terminal === 'stream' && step >= 0 && (
                <div className="space-y-2">
                  <p>
                    {TOKENS.slice(0, visibleTokens).join('')}
                    {!done && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-brand-500 align-middle" />}
                  </p>
                  <pre className="max-h-32 overflow-y-auto rounded bg-slate-50 p-2 text-[0.68rem] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    {TOKENS.slice(0, visibleTokens)
                      .map((t) => `data:${t}\n`)
                      .join('')}
                  </pre>
                  <p className="text-[0.7rem] text-slate-500">
                    {visibleTokens} of {TOKENS.length} chunks emitted. Each one is a ChatResponse whose text holds the delta.
                  </p>
                </div>
              )}
              {done && terminal === 'content' && <p>"{ANSWER}"</p>}
              {done && terminal === 'entity' && (
                <p>
                  SuggestedReply[reply={ANSWER},
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp; needsAgent=true]
                </p>
              )}
              {done && terminal === 'chatResponse' && (
                <pre className="text-[0.72rem] leading-relaxed whitespace-pre-wrap">{`ChatResponse
├─ result.output.text   "${ANSWER}"
├─ result.metadata
│   └─ finishReason     "end_turn"
└─ metadata
    ├─ id               "msg_01HZ…"
    ├─ model            "claude-haiku-4-5"
    └─ usage
        ├─ promptTokens      118
        ├─ completionTokens  27
        └─ totalTokens       145`}</pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </LabFrame>
  );
}
