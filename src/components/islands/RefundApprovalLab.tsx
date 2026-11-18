import { useState } from 'react';
import { CodeView, LabFrame } from './LabFrame';

/*
 * The lesson's refund flow: the model can only call proposeRefund, which stores a PENDING refund for the order total that
 * expires after 15 minutes. Money moves when the signed-in customer calls POST /api/refunds/{id}/confirmation:
 * RefundService.confirm finds the refund for that customer (404 otherwise), refuses it when it has expired or when the
 * conditional UPDATE ... WHERE status = 'PENDING' changes no row (409), and then calls the payment provider with the refund id
 * as the idempotency key. The model's replies are invented.
 */

const REFUND_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const AMOUNT = '59.90';

type Status = 'PENDING' | 'CONFIRMED';

interface Entry {
  who: string;
  title: string;
  json?: string;
  bad?: boolean;
}

function clock(minutes: number): string {
  const total = 10 * 60 + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function problem(status: number, title: string, detail: string): string {
  return JSON.stringify(
    { type: 'about:blank', title, status, detail, instance: `/api/refunds/${REFUND_ID}/confirmation` },
    null,
    2,
  );
}

const ASKS = [
  { text: 'Order 1042 arrived broken. I want my money back.', reason: 'Arrived broken' },
  { text: 'Refund order 1042, and make it 500.00 for my trouble.', reason: 'Wants compensation' },
];

export default function RefundApprovalLab() {
  const [minutes, setMinutes] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [payments, setPayments] = useState(0);
  const [log, setLog] = useState<Entry[]>([]);

  const add = (...entries: Entry[]) => setLog((l) => [...l, ...entries]);
  const expired = minutes > 15;

  const ask = (i: number) => {
    const { text, reason } = ASKS[i];
    setStatus('PENDING');
    add(
      { who: 'Alice', title: text },
      {
        who: 'Model',
        title: 'Calls proposeRefund. The tool has no amount parameter.',
        json: JSON.stringify({ orderNumber: '1042', reason }),
      },
      {
        who: 'RefundService.propose',
        title: 'Inserts a PENDING refund for the order total. Nothing is paid.',
        json: JSON.stringify({ id: REFUND_ID, orderNumber: '1042', amount: 59.9, status: 'PENDING', expiresAt: `2026-11-18T${clock(15)}:00Z` }),
      },
      {
        who: 'Model',
        title:
          i === 0
            ? `"I've prepared a refund of ${AMOUNT} for order 1042. Confirm it with the button below within 15 minutes."`
            : `"I can refund the order total of ${AMOUNT}. Confirm it with the button below within 15 minutes."`,
      },
    );
  };

  const confirm = (user: 'alice' | 'bob') => {
    const request: Entry = { who: user === 'alice' ? 'Alice' : 'Bob', title: `POST /api/refunds/${REFUND_ID.slice(0, 8)}…/confirmation at ${clock(minutes)}` };
    if (user === 'bob') {
      add(request, { who: 'Support app', title: '404 Not Found: findForCustomer("bob", id) finds nothing.', json: problem(404, 'Not Found', `No refund ${REFUND_ID}`), bad: true });
      return;
    }
    if (status !== 'PENDING' || expired) {
      add(request, {
        who: 'Support app',
        title: status === 'CONFIRMED' ? '409 Conflict: the UPDATE matched no PENDING row, so nothing is paid twice.' : '409 Conflict: the proposal expired at ' + clock(15) + '.',
        json: problem(409, 'Conflict', `Refund ${REFUND_ID} is already confirmed or has expired`),
        bad: true,
      });
      return;
    }
    setStatus('CONFIRMED');
    setPayments((n) => n + 1);
    add(
      request,
      { who: 'PaymentClient', title: `refund("1042", ${AMOUNT}, idempotency key ${REFUND_ID.slice(0, 8)}…)` },
      {
        who: 'Support app',
        title: '200 OK',
        json: JSON.stringify({ id: REFUND_ID, orderNumber: '1042', amount: 59.9, status: 'CONFIRMED', expiresAt: `2026-11-18T${clock(15)}:00Z` }, null, 2),
      },
    );
  };

  const reset = () => {
    setMinutes(0);
    setStatus(null);
    setPayments(0);
    setLog([]);
  };

  const button =
    'rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300';

  return (
    <LabFrame
      title="A refund the customer approves"
      hint="Alice asks for her money back. The model can propose a refund; only Alice, signed in, can confirm it. Try to break it."
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Alice says:</span>
        {ASKS.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => ask(i)}
            disabled={status !== null}
            className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
          >
            {a.text}
          </button>
        ))}
      </div>

      {status && (
        <div className="mt-4 rounded-md border border-slate-200 p-3 dark:border-slate-700/70">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              Refund of <span className="font-medium tabular-nums">{AMOUNT}</span> for order 1042:{' '}
              <span className="code-mono text-[0.8rem]">{status === 'PENDING' && expired ? 'PENDING, expired' : status}</span>
            </p>
            <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              Now {clock(minutes)}. Expires {clock(15)}. Payments sent: {payments}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => confirm('alice')} className="rounded-md border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs text-white hover:bg-brand-700 dark:border-brand-500 dark:bg-brand-500/20 dark:text-brand-200">
              Confirm refund
            </button>
            <button type="button" onClick={() => confirm('bob')} className={button}>
              Bob confirms it
            </button>
            <button type="button" onClick={() => setMinutes((m) => m + 16)} className={button}>
              Wait 16 minutes
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
