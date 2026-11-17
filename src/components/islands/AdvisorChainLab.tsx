import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * Steps one ChatClient call through the advisor chain of Spring AI 2.0.2. Every rule here was checked by running the real classes
 * against a fake ChatModel:
 * - Advisors run in ascending getOrder(). Advisors that share an order run in reverse registration order.
 * - ToolCallingAdvisor is registered automatically at HIGHEST_PRECEDENCE + 300. Advisors with a higher order sit inside its loop
 *   and run once per model call; the others run once per ChatClient call.
 * - MessageChatMemoryAdvisor saves the last user or tool message as it reaches it, sends the system message plus the stored
 *   conversation, and saves the reply on the way back.
 * - ChatModelCallAdvisor (LOWEST_PRECEDENCE) is always last and calls the model.
 */

const HIGHEST = -2147483648;
const TOOLS_ORDER = HIGHEST + 300;

type AdvisorId = 'memory' | 'rag' | 'logger';
type NodeId = AdvisorId | 'tools' | 'call';

const POSITIONS = [
  { value: HIGHEST + 100, label: 'HIGHEST_PRECEDENCE + 100', code: 'Ordered.HIGHEST_PRECEDENCE + 100' },
  { value: HIGHEST + 200, label: 'HIGHEST_PRECEDENCE + 200', code: 'Ordered.HIGHEST_PRECEDENCE + 200' },
  { value: 0, label: '0', code: '0' },
];

const ADVISORS: Record<AdvisorId, { name: string; defaultOrder: number }> = {
  memory: { name: 'MessageChatMemoryAdvisor', defaultOrder: HIGHEST + 200 },
  rag: { name: 'RetrievalAugmentationAdvisor', defaultOrder: 0 },
  logger: { name: 'SimpleLoggerAdvisor', defaultOrder: 0 },
};

/** The order the advisors are passed to defaultAdvisors(...). */
const REGISTRATION: AdvisorId[] = ['memory', 'rag', 'logger'];

type Orders = Record<AdvisorId, number>;
const DEFAULT_ORDERS: Orders = { memory: ADVISORS.memory.defaultOrder, rag: ADVISORS.rag.defaultOrder, logger: ADVISORS.logger.defaultOrder };

interface ChainNode {
  id: NodeId;
  name: string;
  order: number;
  orderLabel: string;
  inLoop: boolean;
}

function orderLabel(order: number): string {
  if (order === TOOLS_ORDER) return 'HIGHEST_PRECEDENCE + 300';
  return POSITIONS.find((p) => p.value === order)?.label ?? String(order);
}

function buildChain(orders: Orders): ChainNode[] {
  const advisors = REGISTRATION.map((id, index) => ({ id, order: orders[id], index }));
  const sorted = [...advisors, { id: 'tools' as const, order: TOOLS_ORDER, index: -1 }].sort(
    (a, b) => a.order - b.order || b.index - a.index,
  );
  const nodes: ChainNode[] = sorted.map((a) => ({
    id: a.id,
    name: a.id === 'tools' ? 'ToolCallingAdvisor' : ADVISORS[a.id].name,
    order: a.order,
    orderLabel: orderLabel(a.order),
    inLoop: a.order > TOOLS_ORDER,
  }));
  return [...nodes, { id: 'call', name: 'ChatModelCallAdvisor', order: 2147483647, orderLabel: 'LOWEST_PRECEDENCE', inLoop: true }];
}

type Role = 'system' | 'user' | 'assistant' | 'tool';

interface Msg {
  role: Role;
  text: string;
  docs?: boolean;
}

const SYSTEM: Msg = { role: 'system', text: 'You are the support assistant for Acme Cloud.' };
const HISTORY: Msg[] = [
  { role: 'user', text: 'Hi, I ordered a router last week.' },
  { role: 'assistant', text: 'Thanks. How can I help with it?' },
];
const QUESTION: Msg = { role: 'user', text: 'Where is order 1042?' };
const TOOL_CALL: Msg = { role: 'assistant', text: 'tool call: findOrder({"id":"1042"})' };
const TOOL_RESULT: Msg = { role: 'tool', text: '{"id":"1042","status":"SHIPPED","carrier":"DHL"}' };
const ANSWER: Msg = { role: 'assistant', text: 'Order 1042 shipped with DHL yesterday.' };
const ANSWER_DIRECT: Msg = { role: 'assistant', text: 'Orders usually ship within 2 business days. Check Orders for tracking.' };

type Direction = 'down' | 'up' | 'here';

interface Step {
  node: NodeId | 'client';
  direction: Direction;
  round: number;
  title: string;
  detail: string;
  prompt: Msg[];
  memory: Msg[];
  log: string[];
}

function lastUserOrTool(prompt: Msg[]): Msg {
  return [...prompt].reverse().find((m) => m.role === 'user' || m.role === 'tool') ?? QUESTION;
}

function simulate(chain: ChainNode[], toolLoop: boolean): Step[] {
  const steps: Step[] = [];
  const memory: Msg[] = [...HISTORY];
  const log: string[] = [];
  let modelCalls = 0;
  let round = 0;

  const snap = (node: Step['node'], direction: Direction, title: string, detail: string, prompt: Msg[]) =>
    steps.push({ node, direction, round, title, detail, prompt: [...prompt], memory: [...memory], log: [...log] });

  const ragIndex = chain.findIndex((n) => n.id === 'rag');

  function run(i: number, prompt: Msg[]): Msg {
    const node = chain[i];
    switch (node.id) {
      case 'logger': {
        const withDocs = prompt.some((m) => m.docs);
        log.push(`request: ${prompt.length} messages${withDocs ? ', documents included' : ''}`);
        snap(
          'logger',
          'down',
          'SimpleLoggerAdvisor logs the request',
          `It logs the prompt as it is at this point, at DEBUG level: ${prompt.length} messages` +
            (withDocs ? ', including the retrieved documents.' : i < ragIndex ? ', without the documents RAG adds further down.' : '.'),
          prompt,
        );
        const reply = run(i + 1, prompt);
        log.push(`response: ${reply.text}`);
        snap('logger', 'up', 'SimpleLoggerAdvisor logs the response', `It logs what came back from below: ${reply === TOOL_CALL ? 'a tool call' : 'the answer'}.`, prompt);
        return reply;
      }
      case 'memory': {
        const saved = lastUserOrTool(prompt);
        memory.push(saved);
        const next = [...prompt.filter((m) => m.role === 'system'), ...memory];
        snap(
          'memory',
          'down',
          'MessageChatMemoryAdvisor loads and saves',
          `It saves the ${saved.role} message to conversation c-1${saved.docs ? ', together with the documents RAG put in it' : ''}, then sends the system message followed by all ${memory.length} stored messages.`,
          next,
        );
        const reply = run(i + 1, next);
        memory.push(reply);
        snap('memory', 'up', 'MessageChatMemoryAdvisor saves the reply', `It adds the ${reply === TOOL_CALL ? 'tool call' : 'answer'} to conversation c-1.`, next);
        return reply;
      }
      case 'rag': {
        const user = lastUserOrTool(prompt.filter((m) => m.role === 'user'));
        const next = prompt.map((m) => (m === user ? { ...m, docs: true } : m));
        snap(
          'rag',
          'down',
          'RetrievalAugmentationAdvisor adds documents',
          round > 1
            ? 'It runs again for this model call: another embedding and another vector search, and the 2 documents are added to the user message again.'
            : 'It embeds the question, finds 2 documents in the vector store and adds them to the user message.',
          next,
        );
        const reply = run(i + 1, next);
        snap('rag', 'up', 'RetrievalAugmentationAdvisor passes the reply up', 'It puts the retrieved documents in the response context and returns the reply unchanged.', next);
        return reply;
      }
      case 'tools': {
        let current = prompt;
        round = 1;
        snap('tools', 'down', 'ToolCallingAdvisor starts its loop', 'Every advisor below it now runs once per model call, starting with round 1.', current);
        for (;;) {
          const reply = run(i + 1, current);
          if (reply !== TOOL_CALL) {
            snap('tools', 'up', 'ToolCallingAdvisor returns the answer', `The model answered without asking for a tool, so the loop ends after ${round} round${round > 1 ? 's' : ''}.`, current);
            round = 0;
            return reply;
          }
          current = [...current, TOOL_CALL, TOOL_RESULT];
          round++;
          snap(
            'tools',
            'here',
            'ToolCallingAdvisor runs the tool and loops',
            'The model asked for findOrder(1042). ToolCallingAdvisor calls the method, appends the tool call and its result to the prompt it received, and sends that down the chain again.',
            current,
          );
        }
      }
      case 'call': {
        modelCalls++;
        const reply = !toolLoop ? ANSWER_DIRECT : prompt.some((m) => m.role === 'tool') ? ANSWER : TOOL_CALL;
        snap(
          'call',
          'here',
          `Model call ${modelCalls}`,
          `ChatModelCallAdvisor sends these ${prompt.length} messages to the model, which ${reply === TOOL_CALL ? 'asks for the findOrder tool' : 'answers'}.`,
          prompt,
        );
        return reply;
      }
    }
  }

  const start = [SYSTEM, QUESTION];
  snap('client', 'down', 'ChatClient builds the request', 'The prompt holds the default system message and your user message. CONVERSATION_ID = c-1 is in the request context.', start);
  const reply = run(0, start);
  snap(
    'client',
    'up',
    'call().content() returns',
    `"${reply.text}" The call made ${modelCalls} model call${modelCalls > 1 ? 's' : ''}, and conversation c-1 now holds ${memory.length} messages.`,
    start,
  );
  return steps;
}

function notesFor(chain: ChainNode[], toolLoop: boolean): string[] {
  const notes: string[] = [];
  const at = (id: NodeId) => chain.findIndex((n) => n.id === id);
  const node = (id: NodeId) => chain[at(id)];

  const advisors = chain.filter((n) => n.id !== 'tools' && n.id !== 'call');
  for (let i = 0; i < advisors.length; i++) {
    for (let j = i + 1; j < advisors.length; j++) {
      if (advisors[i].order === advisors[j].order) {
        notes.push(
          `${advisors[i].name} and ${advisors[j].name} share order ${advisors[i].orderLabel}. In 2.0.2 ties run in reverse registration order, so ${advisors[i].name} runs first even though it is registered later. Give each advisor its own order.`,
        );
      }
    }
  }
  if (at('rag') < at('memory')) {
    notes.push('RAG runs before memory, so the retrieved documents are saved in the conversation and sent again with every later question.');
  }
  if (at('logger') < at('rag')) {
    notes.push('The logger runs before RAG, so the log never shows the documents the model actually received.');
  }
  if (toolLoop) {
    const inside = chain.filter((n) => n.inLoop && n.id !== 'call').map((n) => n.name);
    if (inside.length) notes.push(`Inside the tool loop, ${inside.join(' and ')} run${inside.length === 1 ? 's' : ''} once per model call.`);
    if (node('memory').inLoop) notes.push('Memory inside the tool loop also stores the tool call and the tool result.');
  }
  return notes;
}

function javaFor(orders: Orders): string {
  const code = (id: AdvisorId) => POSITIONS.find((p) => p.value === orders[id])?.code ?? '0';
  return `ChatClient.builder(chatModel)
        .defaultSystem("You are the support assistant for Acme Cloud.")
        .defaultAdvisors(
                MessageChatMemoryAdvisor.builder(chatMemory)
                        .order(${code('memory')}).build(),
                RetrievalAugmentationAdvisor.builder()
                        .documentRetriever(retriever)
                        .order(${code('rag')}).build(),
                SimpleLoggerAdvisor.builder()
                        .order(${code('logger')}).build())
        .build();`;
}

const ROLE_STYLE: Record<Role, string> = {
  system: 'text-slate-500 dark:text-slate-400',
  user: 'text-brand-700 dark:text-brand-300',
  assistant: 'text-sky-700 dark:text-sky-300',
  tool: 'text-amber-700 dark:text-amber-300',
};

function Messages({ messages }: { messages: Msg[] }) {
  return (
    <ol className="space-y-1.5">
      {messages.map((m, i) => (
        <li key={i} className="flex gap-2 text-sm leading-snug">
          <span className={'code-mono w-16 shrink-0 text-[0.75rem] uppercase ' + ROLE_STYLE[m.role]}>{m.role}</span>
          <span className="min-w-0 [overflow-wrap:anywhere] text-slate-700 dark:text-slate-300">
            {m.text}
            {m.docs && (
              <span className="ml-1.5 inline-block rounded border border-brand-600/30 bg-brand-50 px-1.5 text-xs text-brand-800 dark:border-brand-400/30 dark:bg-brand-500/10 dark:text-brand-200">
                + 2 documents
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 p-3 dark:border-slate-700/70">
      <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">{title}</h4>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const ARROW: Record<Direction, string> = { down: '↓', up: '↑', here: '●' };

export default function AdvisorChainLab() {
  const [orders, setOrders] = useState<Orders>(DEFAULT_ORDERS);
  const [toolLoop, setToolLoop] = useState(true);
  const [index, setIndex] = useState(0);

  const chain = buildChain(orders);
  const steps = simulate(chain, toolLoop);
  const notes = notesFor(chain, toolLoop);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = steps.length - 1;

  const changeOrder = (id: AdvisorId, value: number) => {
    setOrders((o) => ({ ...o, [id]: value }));
    setIndex(0);
  };
  const changeLoop = (value: boolean) => {
    setToolLoop(value);
    setIndex(0);
  };

  const loopStart = chain.findIndex((n) => n.inLoop);

  return (
    <LabFrame
      title="Advisor chain stepper"
      hint="Change each advisor's order, choose whether the model calls a tool, then step through one call down the chain and back up."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0 space-y-2">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Order of each advisor</legend>
          {REGISTRATION.map((id) => (
            <label key={id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span className="code-mono text-[0.8rem] text-slate-700 dark:text-slate-300">{ADVISORS[id].name}</span>
              <select
                value={orders[id]}
                onChange={(e) => changeOrder(id, Number(e.target.value))}
                className="code-mono rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                    {p.value === ADVISORS[id].defaultOrder ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">The model</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={toolLoop} onClick={() => changeLoop(true)}>
              Calls findOrder, then answers
            </Pill>
            <Pill active={!toolLoop} onClick={() => changeLoop(false)}>
              Answers straight away
            </Pill>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            ToolCallingAdvisor is registered for you at HIGHEST_PRECEDENCE + 300, and ChatModelCallAdvisor always comes last.
          </p>
        </fieldset>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">Your configuration</h4>
        <CodeView code={javaFor(orders)} className="mt-1.5" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">The chain, in order</h4>
          <ol className="mt-1.5 space-y-1" aria-label="Advisor chain">
            {chain.map((n, i) => {
              const active = step.node === n.id;
              return (
                <li key={n.id}>
                  {i === loopStart && (
                    <p className="mb-1 pl-3 text-xs text-amber-700 dark:text-amber-300">Inside the tool loop: once per model call</p>
                  )}
                  <div
                    aria-current={active ? 'step' : undefined}
                    className={
                      'flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ' +
                      (n.inLoop ? 'ml-3 border-l-2 border-l-amber-500/70 ' : '') +
                      (active
                        ? 'border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                        : 'border-slate-200 dark:border-slate-700/70')
                    }
                  >
                    <span aria-hidden="true" className="w-3 text-center text-sm text-brand-700 dark:text-brand-300">
                      {active ? ARROW[step.direction] : ''}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="code-mono block truncate text-[0.8rem] text-slate-800 dark:text-slate-200">{n.name}</span>
                      <span className="code-mono block truncate text-[0.7rem] text-slate-500 dark:text-slate-400">{n.orderLabel}</span>
                    </span>
                    {active && step.round > 0 && n.inLoop && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                        round {step.round}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-brand-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(last, i + 1))}
              disabled={index >= last}
              className="rounded-md border border-brand-600 bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-700 disabled:opacity-40 dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-100"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setIndex(0)}
              disabled={index === 0}
              className="rounded-md px-2 py-1 text-sm text-slate-600 hover:text-brand-700 disabled:opacity-40 dark:text-slate-400 dark:hover:text-brand-300"
            >
              Start over
            </button>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
              Step {Math.min(index, last) + 1} of {steps.length}
            </span>
          </div>

          <div role="status" aria-live="polite" className="rounded-md border border-brand-600/40 bg-brand-50 p-3 dark:border-brand-400/30 dark:bg-brand-500/10">
            <p className="font-medium text-brand-900 dark:text-brand-100">
              <span aria-hidden="true">{ARROW[step.direction]} </span>
              {step.title}
            </p>
            <p className="mt-1 text-sm text-brand-900/90 dark:text-brand-100/90">{step.detail}</p>
          </div>

          <Panel title={step.node === 'call' ? 'What the model receives' : 'The prompt at this point'}>
            <Messages messages={step.prompt} />
          </Panel>
          <div className="space-y-3">
            <Panel title={`Conversation c-1 in ChatMemory (${step.memory.length})`}>
              <Messages messages={step.memory} />
            </Panel>
            <Panel title="SimpleLoggerAdvisor output">
              {step.log.length ? (
                <ol className="code-mono space-y-1 text-[0.75rem] text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">
                  {step.log.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nothing logged yet.</p>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">What this order means</h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </LabFrame>
  );
}
