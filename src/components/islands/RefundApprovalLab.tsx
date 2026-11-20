import { useState } from 'react';
import { CodeView, LabFrame } from './LabFrame';

/*
 * The lesson's refund flow on Spring AI 2.1: refundOrder is marked @Tool(requiresConfirmation = true), so when the model calls
 * it nothing runs and the session keeps the reply with the call. GET /api/chats/{chatId}/confirmation shows the call;
 * POST .../confirmation runs it (approved) or answers it with "The customer declined." through
 * ToolCallingManager.executeToolCalls. RefundService then checks the order total, and inserts one refund per order
 * (ON CONFLICT DO NOTHING) before paying with the refund id as the idempotency key. Nothing waiting in the caller's own
 * session gives a 409. A new message instead of a decision makes the session answer the open call with "No result was recorded
 * for this tool call." The model's replies are invented.
 */

const CHAT = '0f8e2a4c-6b1d-4c3e-9a7f-5d2b8c1e4a60';
const TOTAL = '59.90';
const KEY = 'a1f3c2e0';

interface Entry {
  who: string;
  title: string;
  json?: string;
  bad?: boolean;
}

interface Ask {
  text: string;
  amount: string;
  reason: string;
}

const ASKS: Ask[] = [
  { text: 'Order 1042 arrived broken. I want my money back.', amount: TOTAL, reason: 'Arrived broken' },
  { text: 'Refund order 1042, and make it 500.00 for my trouble.', amount: '500.00', reason: 'Wants compensation' },
];

const conflict = JSON.stringify({
  type: 'about:blank',
  title: 'Conflict',
  status: 409,
  detail: 'Nothing in this chat is waiting for a confirmation',
  instance: `/api/chats/${CHAT}/confirmation`,
});

export default function RefundApprovalLab() {
  const [waiting, setWaiting] = useState<Ask | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [payments, setPayments] = useState(0);
  const [log, setLog] = useState<Entry[]>([]);

  const add = (...entries: Entry[]) => setLog((l) => [...l, ...entries]);
  const args = (a: Ask) => `{"orderNumber":"1042","amount":${a.amount},"reason":"${a.reason}"}`;

  const ask = (a: Ask) => {
    setWaiting(a);
    add(
      { who: 'Alice', title: a.text },
      { who: 'Model', title: 'Calls refundOrder. The tool needs confirmation, so nothing runs.', json: args(a) },
      { who: 'Support app', title: `The session keeps the call. Alice reads: "Please confirm or decline this in the app."` },
      {
        who: 'GET /confirmation',
        title: 'What the app shows Alice before she decides:',
        json: JSON.stringify([{ tool: 'refundOrder', arguments: args(a) }]),
      },
    );
  };

  const nothingWaits = (who: string) =>
    add({ who, title: 'POST /confirmation' }, { who: 'Support app', title: '409 Conflict', json: conflict, bad: true });

  const decide = (approved: boolean) => {
    if (!waiting) {
      nothingWaits('Alice');
      return;
    }
    const a = waiting;
    setWaiting(null);
    const request: Entry = { who: 'Alice', title: `POST /confirmation, approved: ${approved}` };
    if (!approved) {
      add(
        request,
        { who: 'ToolCallingManager', title: 'Denied: the tool result is "The customer declined." Nothing runs.' },
        { who: 'Model', title: '"Okay, I won\'t refund order 1042. Let me know if there\'s anything else."' },
      );
      return;
    }
    if (a.amount !== TOTAL) {
      add(
        request,
        { who: 'RefundService', title: `Refuses: "Order 1042 can only be refunded in full, ${TOTAL}." Nothing is paid.`, bad: true },
        { who: 'Model', title: `"I can only refund the full order total of ${TOTAL}. Would you like that instead?"` },
      );
      return;
    }
    if (refunded) {
      add(
        request,
        { who: 'RefundService', title: 'The insert finds the order\'s refund id taken: "Order 1042 has already been refunded."', bad: true },
        { who: 'Model', title: '"Order 1042 has already been refunded, so there\'s nothing more to send."' },
      );
      return;
    }
    setRefunded(true);
    setPayments((n) => n + 1);
    add(
      request,
      { who: 'RefundService', title: 'Alice owns the order, it was shipped, and the amount is its total. One row inserted.' },
      { who: 'PaymentClient', title: `refund("1042", ${TOTAL}, idempotency key ${KEY}…)` },
      { who: 'Model', title: `"Your refund of ${TOTAL} for order 1042 is on its way."` },
    );
  };

  const writeAgain = () => {
    setWaiting(null);
    add(
      { who: 'Alice', title: 'Actually, never mind.' },
      { who: 'Session', title: 'Answers the open call with "No result was recorded for this tool call." before the new message.' },
      { who: 'Model', title: '"No problem. I haven\'t refunded anything."' },
    );
  };

  const reset = () => {
    setWaiting(null);
    setRefunded(false);
    setPayments(0);
    setLog([]);
  };

  const button =
    'rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300';

  return (
    <LabFrame
      title="A refund the customer confirms"
      hint="Alice asks for her money back. The model's refund call waits until Alice decides; only then does it run. Try to break it."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Alice says:</span>
        {ASKS.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => ask(a)}
            disabled={waiting !== null}
            className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
          >
            {a.text}
          </button>
        ))}
      </div>

      {log.length > 0 && (
        <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-700/70">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              {waiting ? (
                <>
                  Waiting for Alice: refund of <span className="font-medium tabular-nums">{waiting.amount}</span> for order 1042
                </>
              ) : (
                'Nothing waits for a confirmation.'
              )}
            </p>
            <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">Payments sent: {payments}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide(true)}
              className="rounded-md border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs text-white hover:bg-brand-700 dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-200"
            >
              Confirm
            </button>
            <button type="button" onClick={() => decide(false)} className={button}>
              Decline
            </button>
            <button type="button" onClick={() => nothingWaits('Bob')} className={button}>
              Bob confirms it
            </button>
            <button type="button" onClick={writeAgain} disabled={!waiting} className={button}>
              Alice writes something else
            </button>
            <button type="button" onClick={reset} className="ml-auto text-xs text-slate-500 hover:text-brand-700 dark:text-slate-400">
              Start over
            </button>
          </div>
        </div>
      )}

      <ol className="mt-4 space-y-2" aria-live="polite">
        {log.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">Pick what Alice says.</li>}
        {log.map((e, i) => (
          <li
            key={i}
            className={
              'rounded-md border p-2.5 text-sm ' +
              (e.bad ? 'border-rose-300 bg-rose-50 dark:border-rose-800/70 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700/70')
            }
          >
            <p className="[overflow-wrap:anywhere]">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{e.who} </span>
              <span className="text-slate-800 dark:text-slate-200">{e.title}</span>
            </p>
            {e.json && <CodeView code={e.json} lang="json" className="mt-2" />}
          </li>
        ))}
      </ol>
    </LabFrame>
  );
}
