import { useState, type ReactNode } from 'react';
import { CodeView, LabFrame, Slider } from './LabFrame';
import recorded from '../../data/recorded-decisions.json';

/*
 * Recorded, not invented (lesson-src/preview-2.1/probes/recording-to-sandbox.py): twelve preset tickets sent to
 * OllamaDecisionModel with d1-omni:600m (Spring AI 2.1.0-RC2), the router's three questions in one call. The chat side asked
 * a 27B Qwen 3 reasoning model the injection and intent questions as text. The sliders re-route these numbers with the
 * rules of TicketRouter.choose(); nothing here calls a model.
 */

interface Ticket {
  message: string;
  isInjection: boolean;
  injection: number;
  intent: Record<string, number>;
  confidence: number;
  mood: number[];
  moodLevel: number;
  millis: number;
  promptTokens: number;
  chat: { injection: string; intent: string; millis: number; completionTokens: number };
}

const TICKETS = recorded as Ticket[];
const MOODS = ['unhappy', 'neutral', 'happy'];
const UNHAPPY = 0;

type Route = 'REVIEW' | 'HUMAN' | 'PRIORITY_HUMAN' | 'REFUND' | 'ORDER_STATUS' | 'ADDRESS_CHANGE' | 'ASSISTANT';

/** TicketRouter.choose(), on the recorded answers. No question was refused in the recording, so that branch never runs. */
function route(t: Ticket, injectionThreshold: number, minimumConfidence: number): { route: Route; reason: string } {
  if (t.injection >= injectionThreshold) {
    return { route: 'REVIEW', reason: `injection ${t.injection.toFixed(2)}, threshold ${injectionThreshold.toFixed(2)}` };
  }
  const intent = topIntent(t);
  if (t.confidence < minimumConfidence) {
    return {
      route: 'HUMAN',
      reason: `intent ${intent} at confidence ${t.confidence.toFixed(2)}, below ${minimumConfidence.toFixed(2)}`,
    };
  }
  const reason = `intent ${intent} at confidence ${t.confidence.toFixed(2)}`;
  switch (intent) {
    case 'refund':
      return { route: 'REFUND', reason };
    case 'order_status':
      return { route: 'ORDER_STATUS', reason };
    case 'address_change':
      return { route: 'ADDRESS_CHANGE', reason };
    case 'complaint':
      return t.moodLevel === UNHAPPY
        ? { route: 'PRIORITY_HUMAN', reason: `${reason}, customer unhappy` }
        : { route: 'HUMAN', reason };
    default:
      return { route: 'ASSISTANT', reason };
  }
}

function topIntent(t: Ticket): string {
  return Object.entries(t.intent).sort((a, b) => b[1] - a[1])[0][0];
}

/** Three decimals, but never rounded to 0 or 1: those would claim a certainty the model didn't give. */
function p(x: number): string {
  if (x < 0.001) return '< 0.001';
  return x > 0.999 ? x.toFixed(4) : x.toFixed(3);
}

const ROUTE_STYLE: Record<Route, string> = {
  REVIEW: 'border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200',
  HUMAN: 'border-sky-500/40 bg-sky-50 text-sky-900 dark:bg-sky-400/10 dark:text-sky-200',
  PRIORITY_HUMAN: 'border-sky-600/60 bg-sky-100 text-sky-950 dark:bg-sky-400/20 dark:text-sky-100',
  REFUND: 'border-brand-600/40 bg-brand-50 text-brand-900 dark:bg-brand-400/10 dark:text-brand-200',
  ORDER_STATUS: 'border-brand-600/40 bg-brand-50 text-brand-900 dark:bg-brand-400/10 dark:text-brand-200',
  ADDRESS_CHANGE: 'border-brand-600/40 bg-brand-50 text-brand-900 dark:bg-brand-400/10 dark:text-brand-200',
  ASSISTANT: 'border-slate-400/50 bg-slate-50 text-slate-800 dark:bg-slate-700/40 dark:text-slate-200',
};

function RouteBadge({ value }: { value: Route }) {
  return (
    <span className={'shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[0.7rem] whitespace-nowrap ' + ROUTE_STYLE[value]}>{value}</span>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{children}</p>;
}

/** A probability bar with the threshold marked on it. */
function Bar({ value, threshold, alarm }: { value: number; threshold?: number; alarm?: boolean }) {
  return (
    <span className="relative block h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
      <span
        className={'absolute inset-y-0 left-0 rounded-full ' + (alarm ? 'bg-amber-500' : 'bg-brand-600 dark:bg-brand-400')}
        style={{ width: `${Math.max(value * 100, 1)}%` }}
      />
      {threshold !== undefined && (
        <span className="absolute -inset-y-1 w-0.5 rounded bg-slate-900 dark:bg-white" style={{ left: `calc(${threshold * 100}% - 1px)` }} />
      )}
    </span>
  );
}

export default function DecisionLab() {
  const [injectionThreshold, setInjectionThreshold] = useState(0.5);
  const [minimumConfidence, setMinimumConfidence] = useState(0.6);
  const [index, setIndex] = useState(7);

  const routed = TICKETS.map((t) => route(t, injectionThreshold, minimumConfidence));
  const caught = TICKETS.filter((t, i) => t.isInjection && routed[i].route === 'REVIEW').length;
  const injections = TICKETS.filter((t) => t.isInjection).length;
  const falseAlarms = TICKETS.filter((t, i) => !t.isInjection && routed[i].route === 'REVIEW').length;
  const toPeople = routed.filter((r) => r.route === 'HUMAN' || r.route === 'PRIORITY_HUMAN').length;

  const ticket = TICKETS[index];
  const choice = routed[index];
  const intent = topIntent(ticket);
  const reads: [string, string][] = [
    ['answers.getYesNo("injection").getProbability();', ticket.injection.toFixed(4)],
    [`answers.getYesNo("injection").isYes(${injectionThreshold.toFixed(2)});`, String(ticket.injection >= injectionThreshold)],
    ['answers.getChoice("intent").getValue();', `"${intent}"`],
    ['answers.getChoice("intent").getConfidence();', ticket.confidence.toFixed(4)],
    ['answers.getScore("mood").getNearestLevel();', `${ticket.moodLevel} (${MOODS[ticket.moodLevel]})`],
  ];
  const width = Math.max(...reads.map(([call]) => call.length)) + 3;
  const java = [
    'DecisionResponse answers = decisionModel.call(message, QUESTIONS);',
    '',
    ...reads.map(([call, value]) => `${call.padEnd(width)}// ${value}`),
    '',
    `// routed to ${choice.route}: ${choice.reason}`,
  ].join('\n');

  return (
    <LabFrame
      title="Decision model & threshold simulator"
      hint="Twelve tickets recorded through d1-omni:600m. Move the thresholds to re-route them with TicketRouter's rules, then pick a ticket to see its numbers."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          id="dl-injection"
          label="support.routing.injection-threshold"
          value={injectionThreshold}
          onChange={setInjectionThreshold}
          note="isYes(threshold): at or above it, the ticket goes to REVIEW. YesNoAnswer.DEFAULT_THRESHOLD is 0.50."
        />
        <Slider
          id="dl-confidence"
          label="support.routing.minimum-intent-confidence"
          value={minimumConfidence}
          onChange={setMinimumConfidence}
          note="Below it, a person picks the route instead of the model."
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center" aria-live="polite">
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Injections caught</dt>
          <dd className="font-mono text-lg text-slate-900 tabular-nums dark:text-white">
            {caught} of {injections}
          </dd>
        </div>
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">False alarms</dt>
          <dd className={'font-mono text-lg tabular-nums ' + (falseAlarms ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white')}>
            {falseAlarms}
          </dd>
        </div>
        <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700/70">
          <dt className="text-xs text-slate-500 dark:text-slate-400">Sent to a person</dt>
          <dd className="font-mono text-lg text-slate-900 tabular-nums dark:text-white">{toPeople}</dd>
        </div>
      </dl>

      <fieldset className="mt-4 min-w-0">
        <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Tickets: the bar is the injection probability, the line the threshold</legend>
        <ul className="mt-1.5 space-y-1.5">
          {TICKETS.map((t, i) => {
            const r = routed[i];
            const wrong = t.isInjection !== (r.route === 'REVIEW');
            return (
              <li key={t.message}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-pressed={i === index}
                  className={
                    'w-full rounded-md border px-3 py-2 text-left transition-colors ' +
                    (i === index
                      ? 'border-brand-600 bg-brand-50/60 dark:border-brand-500 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-brand-500 dark:border-slate-700/70 dark:hover:border-brand-500')
                  }
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-sm text-slate-800 dark:text-slate-200">{t.message}</span>
                    <RouteBadge value={r.route} />
                  </span>
                  <span className="mt-1.5 flex items-center gap-3">
                    <span className="w-full max-w-56">
                      <Bar value={t.injection} threshold={injectionThreshold} alarm={r.route === 'REVIEW'} />
                    </span>
                    <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">{p(t.injection)}</span>
                    {wrong && (
                      <span className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300">
                        {t.isInjection ? 'missed injection' : 'false alarm'}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700/70">
        <Label>The selected ticket, as the router reads it</Label>
        <CodeView code={java} lang="java" className="mt-1.5" />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Intent probabilities (confidence {ticket.confidence.toFixed(3)})</Label>
            <ul className="mt-1.5 space-y-1">
              {Object.entries(ticket.intent).map(([option, value]) => (
                <li key={option} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                  <span className="font-mono text-slate-700 dark:text-slate-300">{option}</span>
                  <Bar value={value} />
                  <span className="text-right font-mono text-slate-500 tabular-nums dark:text-slate-400">{p(value)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">Mood level probabilities</p>
            <ul className="mt-1.5 space-y-1">
              {ticket.mood.map((value, level) => (
                <li key={level} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {level} {MOODS[level]}
                  </span>
                  <Bar value={value} />
                  <span className="text-right font-mono text-slate-500 tabular-nums dark:text-slate-400">{p(value)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-300">
            <Label>The same questions asked of a chat model as text</Label>
            <p className="mt-1.5">
              A 27B reasoning model answered{' '}
              <span className="font-mono text-slate-900 dark:text-white">"{ticket.chat.injection}"</span> to the injection question and{' '}
              <span className="font-mono text-slate-900 dark:text-white">"{ticket.chat.intent}"</span> to the intent question.
            </p>
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="pb-1 font-medium" scope="col"></th>
                  <th className="pb-1 font-medium" scope="col">Decision model</th>
                  <th className="pb-1 font-medium" scope="col">Chat model</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                <tr className="border-t border-slate-200 dark:border-slate-700/70">
                  <th className="py-1 pr-2 text-left font-sans font-normal text-slate-500 dark:text-slate-400" scope="row">
                    Calls
                  </th>
                  <td>1</td>
                  <td>2</td>
                </tr>
                <tr className="border-t border-slate-200 dark:border-slate-700/70">
                  <th className="py-1 pr-2 text-left font-sans font-normal text-slate-500 dark:text-slate-400" scope="row">
                    Time
                  </th>
                  <td>{(ticket.millis / 1000).toFixed(2)} s</td>
                  <td>{(ticket.chat.millis / 1000).toFixed(1)} s</td>
                </tr>
                <tr className="border-t border-slate-200 dark:border-slate-700/70">
                  <th className="py-1 pr-2 text-left font-sans font-normal text-slate-500 dark:text-slate-400" scope="row">
                    Output tokens
                  </th>
                  <td>0</td>
                  <td>{ticket.chat.completionTokens}</td>
                </tr>
                <tr className="border-t border-slate-200 dark:border-slate-700/70">
                  <th className="py-1 pr-2 text-left font-sans font-normal text-slate-500 dark:text-slate-400" scope="row">
                    Answer
                  </th>
                  <td>numbers</td>
                  <td>text to parse</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              The chat model was right on all twelve, the benign question included, but each ticket took seconds and a parser. The
              decision model gives a probability you can set a threshold on, in well under a second, with no output to parse.
            </p>
          </div>
        </div>
      </div>
    </LabFrame>
  );
}
