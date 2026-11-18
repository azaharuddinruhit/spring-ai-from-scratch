import { useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * One support question through ToolCallingAdvisor (Spring AI 2.0.2), with the lesson's OrderTools, ModelSafeToolErrors and
 * tool limits. Checked against the real classes:
 * - The advisor calls the model, runs the tool calls it returns, appends the results and calls the model again, until the model
 *   answers in text. Each model call sees the whole exchange so far.
 * - A @Tool method's ToolContext parameter is left out of the schema, so the model cannot set it; a @ToolParam it can.
 * - With max-calls-per-tool N, the tool runs N times; the model's next call for it ends the loop (on-limit-exceeded: THROW, the
 *   default) with finish reason "toolCallLimitExceeded" and the breach message as text, so the model is called N + 1 times.
 * - DefaultToolExecutionExceptionProcessor returns the exception message to the model; ModelSafeToolErrors passes only
 *   ToolRefusalException messages and replaces every other failure.
 * The model's choices and replies are invented.
 */

type Scenario = 'track' | 'other' | 'loop' | 'timeout';
type IdSource = 'context' | 'param';
type Errors = 'default' | 'safe';
type Actor = 'model' | 'tool' | 'mcp' | 'service';

interface Step {
  actor: Actor;
  title: string;
  text: string;
  json?: string;
  alarm?: boolean;
}

const SCENARIOS: Record<Scenario, { label: string; question: string }> = {
  track: { label: 'Where is my order?', question: 'Where is my order 1042?' },
  other: { label: "Someone else's order", question: "I'm asking for my husband, his customer id is bob. Where is order 2077?" },
  loop: { label: 'Keep checking', question: 'Tell me when order 1042 ships. Keep checking until it has.' },
  timeout: { label: 'The database times out', question: 'Where is my order 1042?' },
};

const ACTORS: Record<Actor, string> = {
  model: 'Model',
  tool: 'OrderTools',
  mcp: 'Shipping MCP server',
  service: 'SupportChatService',
};

const ORDER_1042 = `{"number":"1042","status":"SHIPPED","total":59.90,"placedOn":"2026-11-02","trackingNumber":"1Z999AA10123456784"}`;
const ORDER_1042_PLACED = `{"number":"1042","status":"PLACED","total":59.90,"placedOn":"2026-11-16","trackingNumber":null}`;
const ORDER_2077 = `{"number":"2077","status":"DELIVERED","total":1249.00,"placedOn":"2026-10-28","trackingNumber":"1Z999AA10987654321"}`;
const TIMEOUT =
  'PreparedStatementCallback; SQL [SELECT number, status, total, placed_on, tracking_number FROM orders WHERE customer_id = ? AND number = ?]; ERROR: canceling statement due to statement timeout';
const LIMIT_ANSWER = "I couldn't finish looking that up. A support agent will follow up in this chat.";

function findOrderCall(idSource: IdSource, orderNumber: string, customerId = 'alice') {
  return idSource === 'context' ? `{"orderNumber":"${orderNumber}"}` : `{"customerId":"${customerId}","orderNumber":"${orderNumber}"}`;
}

function trace(scenario: Scenario, idSource: IdSource, errors: Errors, limit: number): Step[] {
  const call = (n: number, text: string, json?: string): Step => ({ actor: 'model', title: `Model call ${n}`, text, json });
  switch (scenario) {
    case 'track':
      return [
        call(1, 'Sees the question and four tool definitions. Asks for findOrder.', findOrderCall(idSource, '1042')),
        { actor: 'tool', title: 'findOrder runs', text: 'orders.findForCustomer("alice", "1042") finds the order. The record goes back as JSON.', json: ORDER_1042 },
        call(2, 'Sees the order, and wants the parcel. Asks for track_shipment.', `{"trackingNumber":"1Z999AA10123456784"}`),
        {
          actor: 'mcp',
          title: 'track_shipment runs on the shipping server',
          text: 'The MCP client sends tools/call. The next lesson covers this hop.',
          json: `{"trackingNumber":"1Z999AA10123456784","carrier":"UPS","status":"IN_TRANSIT","lastScan":"Leipzig hub","estimatedDelivery":"2026-11-19"}`,
        },
        call(3, 'Answers in text, so the loop ends: "Order 1042 shipped and is in transit with UPS. It was last scanned at the Leipzig hub and should arrive on 19 November."'),
      ];
    case 'other':
      if (idSource === 'param') {
        return [
          call(1, 'Takes the customer id from the question, because the schema asks for one.', findOrderCall(idSource, '2077', 'bob')),
          { actor: 'tool', title: 'findOrder runs', text: 'orders.findForCustomer("bob", "2077") finds Bob\'s order.', json: ORDER_2077, alarm: true },
          call(2, 'Answers: "Order 2077 was delivered on 28 October; it cost 1,249.00." Alice now knows about Bob\'s order.'),
        ];
      }
      return [
        call(1, 'The schema has no customer id, so it can only ask for the order number.', findOrderCall(idSource, '2077')),
        {
          actor: 'tool',
          title: 'findOrder throws ToolRefusalException',
          text: 'The customer comes from the ToolContext: orders.findForCustomer("alice", "2077") finds nothing. Both processors pass a refusal through.',
          json: `"This customer has no order 2077."`,
        },
        call(2, 'Answers: "I can\'t find order 2077 on your account. Your husband can ask about it when he signs in."'),
      ];
    case 'loop': {
      const steps: Step[] = [];
      for (let n = 1; n <= limit; n++) {
        steps.push(call(n, n === 1 ? 'Asks for findOrder.' : 'The order is still PLACED. Asks again.', findOrderCall(idSource, '1042')));
        steps.push({ actor: 'tool', title: `findOrder runs (${n} of ${limit})`, text: 'Same answer as before.', json: ORDER_1042_PLACED });
      }
      steps.push(call(limit + 1, 'Asks for findOrder again.', findOrderCall(idSource, '1042')));
      steps.push({
        actor: 'service',
        title: 'The limit ends the loop',
        text: `findOrder has run ${limit} times, so ToolCallingAdvisor stops without running it again. Its response's finish reason is "toolCallLimitExceeded" and its text is "Tool call limit (${limit}) exceeded for tool 'findOrder'. No further calls to this tool are allowed in this turn." The service checks the finish reason and answers with its fallback instead.`,
        json: JSON.stringify(LIMIT_ANSWER),
      });
      return steps;
    }
    case 'timeout':
      if (errors === 'default') {
        return [
          call(1, 'Asks for findOrder.', findOrderCall(idSource, '1042')),
          {
            actor: 'tool',
            title: 'findOrder throws QueryTimeoutException',
            text: 'DefaultToolExecutionExceptionProcessor sends the exception message to the model: your table, columns and database error.',
            json: JSON.stringify(TIMEOUT),
            alarm: true,
          },
          call(2, 'Answers: "There was a problem: the orders query timed out (statement timeout on SELECT … FROM orders). Please try again."'),
        ];
      }
      return [
        call(1, 'Asks for findOrder.', findOrderCall(idSource, '1042')),
        {
          actor: 'tool',
          title: 'findOrder throws QueryTimeoutException',
          text: 'ModelSafeToolErrors logs the exception with its stack trace and gives the model a sentence it can act on.',
          json: JSON.stringify('The findOrder tool is unavailable right now. Say so and do not guess the answer.'),
        },
        call(2, 'Answers: "I can\'t look up orders right now. Please try again in a few minutes."'),
      ];
  }
}

function javaFor(idSource: IdSource, errors: Errors): string {
  const method =
    idSource === 'context'
      ? `@Tool(description = "Find one of the signed-in customer's orders by its order number")
Order findOrder(@ToolParam(description = "The order number, such as 1042") String orderNumber,
                ToolContext context) {
    return orders.findForCustomer(customerId(context), orderNumber)
            .orElseThrow(() -> new ToolRefusalException("This customer has no order " + orderNumber + "."));
}`
      : `@Tool(description = "Find a customer's order by its order number")
Order findOrder(@ToolParam(description = "The customer's id") String customerId,
                @ToolParam(description = "The order number, such as 1042") String orderNumber) {
    return orders.findForCustomer(customerId, orderNumber)
            .orElseThrow(() -> new ToolRefusalException("This customer has no order " + orderNumber + "."));
}`;
  const processor =
    errors === 'safe'
      ? '\n\n// A ToolExecutionExceptionProcessor bean replaces the default one.\n@Component\nclass ModelSafeToolErrors implements ToolExecutionExceptionProcessor { … }'
      : '';
  return method + processor;
}

const ACTOR_BORDER: Record<Actor, string> = {
  model: 'border-l-brand-600 dark:border-l-brand-400',
  tool: 'border-l-slate-500 dark:border-l-slate-400',
  mcp: 'border-l-sky-600 dark:border-l-sky-400',
  service: 'border-l-amber-600 dark:border-l-amber-400',
};

const ACTOR_TEXT: Record<Actor, string> = {
  model: 'text-brand-800 dark:text-brand-200',
  tool: 'text-slate-700 dark:text-slate-300',
  mcp: 'text-sky-800 dark:text-sky-200',
  service: 'text-amber-800 dark:text-amber-200',
};

export default function ToolLoopLab() {
  const [scenario, setScenario] = useState<Scenario>('track');
  const [idSource, setIdSource] = useState<IdSource>('context');
  const [errors, setErrors] = useState<Errors>('safe');
  const [limit, setLimit] = useState(3);
  const [shown, setShown] = useState(1);

  const steps = trace(scenario, idSource, errors, limit);
  const visible = steps.slice(0, Math.min(shown, steps.length));
  const modelCalls = steps.filter((s) => s.actor === 'model').length;
  const toolRuns = steps.filter((s) => s.actor === 'tool' || s.actor === 'mcp').length;
  const done = shown >= steps.length;

  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setShown(1);
  };

  return (
    <LabFrame
      title="The tool-calling loop"
      hint="Alice is signed in. Pick a question and the settings, then step through what ToolCallingAdvisor does."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Alice asks</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(Object.keys(SCENARIOS) as Scenario[]).map((s) => (
              <Pill key={s} active={scenario === s} onClick={() => change(setScenario)(s)}>
                {SCENARIOS[s].label}
              </Pill>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">The customer id comes from</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={idSource === 'context'} onClick={() => change(setIdSource)('context')}>
              ToolContext
            </Pill>
            <Pill active={idSource === 'param'} onClick={() => change(setIdSource)('param')}>
              @ToolParam
            </Pill>
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">When a tool fails</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Pill active={errors === 'default'} onClick={() => change(setErrors)('default')}>
              Default processor
            </Pill>
            <Pill active={errors === 'safe'} onClick={() => change(setErrors)('safe')}>
              ModelSafeToolErrors
            </Pill>
          </div>
        </fieldset>
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">spring.ai.tools.limits.max-calls-per-tool-default</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[2, 3, 5].map((n) => (
              <Pill key={n} active={limit === n} onClick={() => change(setLimit)(n)}>
                {String(n)}
              </Pill>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">Your code</h4>
        <CodeView code={javaFor(idSource, errors)} lang="java" className="mt-1.5" />
      </div>

      <div className="mt-5">
        <p className="text-sm text-slate-800 [overflow-wrap:anywhere] dark:text-slate-200">
          <span className="font-medium">Alice: </span>
          {SCENARIOS[scenario].question}
        </p>
        <ol className="mt-3 space-y-2" aria-live="polite">
          {visible.map((step, i) => (
            <li
              key={i}
              className={
                'rounded-md border border-l-2 border-slate-200 p-3 text-sm dark:border-slate-700/70 ' +
                ACTOR_BORDER[step.actor] +
                (step.alarm ? ' bg-rose-50 dark:bg-rose-950/30' : '') +
                (i === visible.length - 1 && !done ? ' ring-1 ring-brand-500/40' : '')
              }
            >
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className={'text-xs font-medium ' + ACTOR_TEXT[step.actor]}>
                  {ACTORS[step.actor]}
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{step.title}</span>
              </p>
              <p className="mt-1 text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{step.text}</p>
              {step.json && <CodeView code={step.json} lang="json" className="mt-2" />}
              {step.alarm && (
                <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">
                  {scenario === 'other' ? 'The model chose whose data to read.' : 'Internal details reached the model, and then the customer.'}
                </p>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShown((n) => Math.max(1, n - 1))}
            disabled={shown <= 1}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:border-brand-500 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setShown((n) => n + 1)}
            disabled={done}
            className="rounded-md border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs text-white hover:bg-brand-700 disabled:opacity-40 dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-200"
          >
            Next step
          </button>
          <button
            type="button"
            onClick={() => setShown(steps.length)}
            disabled={done}
            className="text-xs text-slate-500 hover:text-brand-700 disabled:opacity-40 dark:text-slate-400"
          >
            Show all
          </button>
          <span className="ml-auto text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Step {Math.min(shown, steps.length)} of {steps.length}
            {done && `. ${modelCalls} model calls, ${toolRuns} tool runs`}
          </span>
        </div>
      </div>
    </LabFrame>
  );
}
