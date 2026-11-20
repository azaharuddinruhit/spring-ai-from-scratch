import { useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';
import recorded from '../../data/recorded-parts.json';

/*
 * Recorded, not invented (lesson-src/preview-2.1/probes/parts-to-sandbox.py): the lesson's OrderAssistant on Spring AI
 * 2.1.0-RC2 (2.1.0 changed only the finish reason category), through OpenAiChatModel, against a 27B Qwen 3 reasoning model behind an OpenAI-compatible server. For every model
 * call the sandbox shows the parts Spring AI built and the JSON that went over the wire (tool definitions and the model name
 * left out). Nothing is computed except which request carried reasoning back.
 */

interface Part {
  kind: 'reasoning' | 'text' | 'toolCall' | 'toolResult';
  text?: string;
  name?: string;
  arguments?: string;
  partIndex?: number;
  partial?: boolean;
}

interface WireMessage {
  role: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: unknown[];
}

interface Call {
  request: { messages: WireMessage[] } & Record<string, unknown>;
  reply: unknown;
  parts: Part[] | null;
  chunks?: Part[];
  promptTokens: number;
  completionTokens: number;
  millis: number;
}

interface Step {
  key: string;
  answer: string;
  reasoning: string | null;
  calls: Call[];
}

const STEPS = recorded as unknown as Step[];

const SCENARIOS: Record<string, { label: string; code: string; note: string }> = {
  reply: {
    label: 'Reasoning and a tool call',
    code: 'assistant.reply("Where is my order A-1042?")',
    note: 'The default: reasoning on, and replayed to the model with the tool result.',
  },
  'no-replay': {
    label: 'Replay off',
    code: '.options(OpenAiChatOptions.builder().replayReasoningContent(false))',
    note: 'The same question, with the tool-call turn sent back without its reasoning.',
  },
  'quick-reply': {
    label: 'Thinking off, from Java',
    code: '.extraBody(Map.of("chat_template_kwargs", Map.of("enable_thinking", false)))',
    note: "Qwen 3's chat template flag, sent as a JSON boolean.",
  },
  'property-extra-body': {
    label: 'Thinking off, as a property',
    code: 'spring.ai.openai.chat.extra-body.chat_template_kwargs.enable_thinking: false',
    note: 'The same flag set in application.yaml.',
  },
  stream: {
    label: 'Streaming',
    code: 'assistant.streamReply("Where is my order A-1042?")',
    note: 'stream().content(): reasoning arrives as partial parts, the customer gets only text.',
  },
  'no-tool': {
    label: 'No tool needed',
    code: 'assistant.reply("Is 391 a prime number?")',
    note: 'One call: reasoning, then the answer.',
  },
};

const PART_CLASS: Record<Part['kind'], string> = {
  reasoning: 'ReasoningPart',
  text: 'TextPart',
  toolCall: 'ToolCallPart',
  toolResult: 'ToolResultPart',
};

const PART_STYLE: Record<Part['kind'], string> = {
  reasoning: 'border-l-amber-500 bg-amber-50/60 dark:bg-amber-400/5',
  text: 'border-l-brand-600 bg-brand-50/60 dark:border-l-brand-400 dark:bg-brand-400/5',
  toolCall: 'border-l-slate-500 bg-slate-50 dark:bg-slate-800/50',
  toolResult: 'border-l-slate-500 bg-slate-50 dark:bg-slate-800/50',
};

function PartCard({ part, index }: { part: Part; index: number }) {
  return (
    <li className={'rounded-md border border-l-4 border-slate-200 p-2.5 dark:border-slate-700/70 ' + PART_STYLE[part.kind]}>
      <p className="flex items-baseline gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-mono tabular-nums">{index}</span>
        <span className="font-mono font-medium text-slate-900 dark:text-white">{PART_CLASS[part.kind]}</span>
      </p>
      {part.kind === 'toolCall' ? (
        <p className="mt-1 font-mono text-xs [overflow-wrap:anywhere] text-slate-800 dark:text-slate-200">
          {part.name}({part.arguments})
        </p>
      ) : (
        <p className="mt-1 text-sm whitespace-pre-line [overflow-wrap:anywhere] text-slate-800 dark:text-slate-200">{part.text?.trim()}</p>
      )}
    </li>
  );
}

function ChunkStream({ chunks }: { chunks: Part[] }) {
  return (
    <div className="mt-1.5 rounded-md border border-slate-200 p-2.5 dark:border-slate-700/70">
      <p className="text-xs leading-6 [overflow-wrap:anywhere]">
        {chunks.map((c, i) => (
          <span
            key={i}
            className={
              'mr-0.5 rounded px-1 py-0.5 font-mono ' +
              (c.kind === 'reasoning'
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100'
                : c.kind === 'text'
                  ? 'bg-brand-100 text-brand-900 dark:bg-brand-400/15 dark:text-brand-100'
                  : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100')
            }
            title={`${PART_CLASS[c.kind]}, partIndex ${c.partIndex}${c.partial ? ', partial' : ', complete'}`}
          >
            {c.kind === 'toolCall'
              ? c.partial
                ? c.arguments || `${c.name}(`
                : `✓ ${c.name}(${c.arguments})`
              : c.text?.replace(/\n/g, '⏎')}
          </span>
        ))}
      </p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Amber chunks are <span className="font-mono">ReasoningPart</span>, grey <span className="font-mono">ToolCallPart</span>{' '}
        (argument fragments, then the complete call), green <span className="font-mono">TextPart</span>. Each carries a{' '}
        <span className="font-mono">partIndex</span> attribute. Only the green ones reach <span className="font-mono">content()</span>.
      </p>
    </div>
  );
}

export default function MessagePartsLab() {
  const [stepKey, setStepKey] = useState('reply');
  const [callIndex, setCallIndex] = useState(0);
  const [view, setView] = useState<'parts' | 'wire'>('parts');

  const step = STEPS.find((s) => s.key === stepKey)!;
  const scenario = SCENARIOS[step.key];
  const call = step.calls[Math.min(callIndex, step.calls.length - 1)];
  const shownIndex = step.calls.indexOf(call);
  const replayed = call.request.messages.find((m) => m.role === 'assistant');
  const { messages, ...extra } = call.request;
  // The message that matters: the tool-call turn sent back, or else the question.
  // Keys reordered so reasoning_content shows before the tool calls; JSON key order carries no meaning.
  const { role, reasoning_content, ...rest } = replayed ?? messages.find((m) => m.role === 'user')!;
  const focus = { role, ...(reasoning_content === undefined ? {} : { reasoning_content }), ...rest };
  const isLast = shownIndex === step.calls.length - 1;

  const choose = (key: string) => {
    setStepKey(key);
    setCallIndex(0);
  };

  return (
    <LabFrame
      title="Read a reply part by part"
      hint="Six recorded runs of the lesson's assistant. Pick one, step through its model calls, and compare the parts with the wire JSON."
    >
      <fieldset className="min-w-0">
        <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Run</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {Object.entries(SCENARIOS).map(([key, { label }]) => (
            <Pill key={key} active={key === step.key} onClick={() => choose(key)}>
              {label}
            </Pill>
          ))}
        </div>
      </fieldset>
      <p className="mt-2 font-mono text-xs [overflow-wrap:anywhere] text-slate-700 dark:text-slate-300">{scenario.code}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{scenario.note}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Model call">
          {step.calls.map((_, i) => (
            <Pill key={i} active={i === shownIndex} onClick={() => setCallIndex(i)}>
              Call {i + 1}
            </Pill>
          ))}
        </div>
        <div className="flex gap-2" role="group" aria-label="View">
          <Pill active={view === 'parts'} onClick={() => setView('parts')}>
            Spring AI parts
          </Pill>
          <Pill active={view === 'wire'} onClick={() => setView('wire')}>
            Wire JSON
          </Pill>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['Prompt tokens', call.promptTokens.toLocaleString('en')],
          ['Completion tokens', call.completionTokens.toLocaleString('en')],
          ['Seconds', (call.millis / 1000).toFixed(1)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="font-mono text-lg text-slate-900 tabular-nums dark:text-white">{value}</dd>
          </div>
        ))}
      </dl>

      {replayed && (
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" aria-live="polite">
          {replayed.reasoning_content
            ? 'This request sends the tool-call turn back with its reasoning, as reasoning_content.'
            : 'This request sends the tool-call turn back without its reasoning.'}
        </p>
      )}
      {'chat_template_kwargs' in extra && (
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          The request carries <span className="font-mono">enable_thinking: {JSON.stringify((extra.chat_template_kwargs as { enable_thinking: unknown }).enable_thinking)}</span>
          {call.parts?.some((p) => p.kind === 'reasoning') || call.chunks?.some((p) => p.kind === 'reasoning')
            ? ', and the reply still reasons: a non-empty string counts as true.'
            : ', and the reply has no reasoning.'}
        </p>
      )}

      {view === 'parts' ? (
        <div className="mt-3">
          {call.chunks ? (
            <>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">The stream, chunk by chunk</p>
              <ChunkStream chunks={call.chunks} />
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="font-mono">getParts()</span> of the reply, in order
              </p>
              <ol className="mt-1.5 space-y-2">
                {call.parts!.map((p, i) => (
                  <PartCard key={i} part={p} index={i} />
                ))}
              </ol>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 grid min-w-0 gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Request: {replayed ? 'the assistant turn it sends back' : 'the question'}, of {messages.length} messages (tool
              definitions left out)
            </p>
            <CodeView code={JSON.stringify({ ...extra, messages: [focus] })} lang="json" className="mt-1.5 max-h-80" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {Array.isArray(call.reply) ? `Reply: ${call.reply.length} streamed deltas` : 'Reply message'}
            </p>
            <CodeView code={JSON.stringify(call.reply)} lang="json" className="mt-1.5 max-h-80" />
          </div>
        </div>
      )}

      {isLast && (
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700/70">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">What the service returned</p>
          <p className="mt-1.5 text-sm text-slate-900 dark:text-white">
            <span className="text-xs text-slate-500 dark:text-slate-400">answer: </span>
            {step.answer}
          </p>
          {step.reasoning !== null && (
            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span className="text-xs text-slate-500 dark:text-slate-400">reasoning: </span>
              {step.reasoning || 'empty'}
            </p>
          )}
          {step.calls.length > 1 && step.reasoning && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Only the last call's reasoning: the reasoning before the tool call went back to the model, not to the caller.
            </p>
          )}
        </div>
      )}
    </LabFrame>
  );
}
