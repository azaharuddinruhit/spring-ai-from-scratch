import { useState, type ReactNode } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * The lesson's TicketReplyService: a planner splits the ticket into issues (at most MAX_ISSUES = 4), each issue goes to its
 * department's writer, the writers run in parallel, an editor merges two or more answers, and a reviewer sends the reply back to
 * the editor until it approves or MAX_ROUNDS runs out (then needsAgent is true). The control flow is the service's; the plans,
 * answers and reviews are invented.
 */

type Department = 'BILLING' | 'TECHNICAL' | 'ACCOUNT';
type TicketId = 'outage' | 'two' | 'five';

interface Issue {
  department: Department;
  question: string;
  answer: string;
}

interface Ticket {
  label: string;
  subject: string;
  body: string;
  issues: Issue[];
  merged: string;
  /** What the reviewer says about each draft, in order; null approves. */
  reviews: (string | null)[];
  revisions: string[];
}

const MAX_ISSUES = 4;

const TICKETS: Record<TicketId, Ticket> = {
  outage: {
    label: 'One issue',
    subject: '502 errors',
    body: 'Every call to /v1/chat fails with 502 since 9:00. We are blocked.',
    issues: [
      {
        department: 'TECHNICAL',
        question: 'Why does every call to /v1/chat return 502 since 9:00?',
        answer: 'Sorry for the trouble. Please send the request id of one failing call, from the x-request-id header, so we can trace it.',
      },
    ],
    merged: '',
    reviews: [null],
    revisions: [],
  },
  two: {
    label: 'Two issues',
    subject: 'Charged twice, and a new colleague',
    body: 'My card was charged twice for November. Also, how do I add a colleague to our team?',
    issues: [
      {
        department: 'BILLING',
        question: 'Why was the card charged twice for November?',
        answer: 'I can see two November charges. The duplicate will be refunded by Friday.',
      },
      {
        department: 'ACCOUNT',
        question: 'How does the customer add a colleague to the team?',
        answer: 'Go to Settings, then Users, then Invite, and enter their email address.',
      },
    ],
    merged:
      'Hi, thanks for writing. I can see two November charges; the duplicate will be refunded by Friday. To add a colleague, go to Settings, then Users, then Invite, and enter their email address. Best regards',
    reviews: ['It promises the refund by Friday.', null],
    revisions: [
      'Hi, thanks for writing. I can see two November charges. You can propose a refund of the duplicate in the app, under Billing. To add a colleague, go to Settings, then Users, then Invite, and enter their email address. Best regards',
    ],
  },
  five: {
    label: 'Five issues',
    subject: 'Several problems',
    body: "I can't sign in, the October invoice has the wrong VAT number, the API is slow, I want the Team plan, and please delete all our data.",
    issues: [
      { department: 'ACCOUNT', question: "Why can't the customer sign in?", answer: 'Reset your password from the sign-in page; the link is valid for an hour.' },
      { department: 'BILLING', question: 'How is the VAT number on the October invoice corrected?', answer: 'Update the VAT number under Billing; we then reissue the invoice.' },
      { department: 'TECHNICAL', question: 'Why is the API slow?', answer: 'Please send the request id of a slow call so we can trace it.' },
      { department: 'ACCOUNT', question: 'How does the customer move to the Team plan?', answer: 'Change the plan under Settings, then Plan.' },
      { department: 'ACCOUNT', question: "How is all of the customer's data deleted?", answer: '' },
    ],
    merged:
      'Hi, thanks for the list. Reset your password from the sign-in page. Update the VAT number under Billing and we will reissue the invoice. Please send the request id of a slow call. You can change the plan under Settings, then Plan. Best regards',
    reviews: ['It does not answer the request to delete all data.', 'It does not answer the request to delete all data.', 'It does not answer the request to delete all data.'],
    revisions: [
      'Hi, thanks for the list. Reset your password from the sign-in page. Update the VAT number under Billing and we will reissue the invoice. Please send the request id of a slow call. You can change the plan under Settings, then Plan. We will get back to you about your data. Best regards',
      'Hi, thanks for the list. Reset your password from the sign-in page. Update the VAT number under Billing and we will reissue the invoice. Please send the request id of a slow call. You can change the plan under Settings, then Plan. A colleague will contact you about your data. Best regards',
    ],
  },
};

interface Run {
  sent: Issue[];
  dropped: Issue[];
  rounds: { draft: string; problem: string | null }[];
  reply: string;
  needsAgent: boolean;
  modelCalls: number;
}

function run(ticket: Ticket, maxRounds: number): Run {
  const sent = ticket.issues.slice(0, MAX_ISSUES);
  const dropped = ticket.issues.slice(MAX_ISSUES);
  let draft = sent.length === 1 ? sent[0].answer : ticket.merged;
  const rounds: Run['rounds'] = [];
  for (let round = 1; ; round++) {
    const problem = ticket.reviews[Math.min(round, ticket.reviews.length) - 1];
    rounds.push({ draft, problem });
    if (problem === null || round === maxRounds) break;
    draft = ticket.revisions[round - 1];
  }
  const last = rounds[rounds.length - 1];
  return {
    sent,
    dropped,
    rounds,
    reply: last.draft,
    needsAgent: last.problem !== null,
    // planner + writers + merge (two or more answers) + one review per round + one revision between rounds
    modelCalls: 1 + sent.length + (sent.length > 1 ? 1 : 0) + rounds.length + (rounds.length - 1),
  };
}

const DEPARTMENT_STYLE: Record<Department, string> = {
  BILLING: 'text-amber-800 dark:text-amber-200',
  TECHNICAL: 'text-sky-800 dark:text-sky-200',
  ACCOUNT: 'text-brand-800 dark:text-brand-200',
};

function Stage({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <li className="min-w-0">
      <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</h4>
      {note && <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p>}
      <div className="mt-1.5">{children}</div>
    </li>
  );
}

export default function TicketWorkflowLab() {
  const [ticketId, setTicketId] = useState<TicketId>('two');
  const [maxRounds, setMaxRounds] = useState(3);
  const ticket = TICKETS[ticketId];
  const result = run(ticket, maxRounds);
  const plan = `{"issues": [\n${ticket.issues.map(({ department, question }) => '  ' + JSON.stringify({ department, question })).join(',\n')}\n]}`;
  const departments = [...new Set(result.sent.map((i) => i.department))];
  const draft = { departments, reply: result.reply, rounds: result.rounds.length, needsAgent: result.needsAgent };

  return (
    <LabFrame title="A ticket through the workflow" hint="Pick a ticket and a round limit. The code decides every step; the model only fills each one in.">
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Ticket</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(Object.keys(TICKETS) as TicketId[]).map((t) => (
              <Pill key={t} active={ticketId === t} onClick={() => setTicketId(t)}>
                {TICKETS[t].label}
              </Pill>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">MAX_ROUNDS</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {[1, 2, 3].map((n) => (
              <Pill key={n} active={maxRounds === n} onClick={() => setMaxRounds(n)}>
                {String(n)}
              </Pill>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-4 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700/70">
        <p className="font-medium text-slate-900 dark:text-slate-100">{ticket.subject}</p>
        <p className="mt-1 text-slate-700 dark:text-slate-300">{ticket.body}</p>
      </div>

      <ol className="mt-4 space-y-4 border-l-2 border-slate-200 pl-4 dark:border-slate-700/70">
        <Stage title="Planner: entity(Plan.class)" note="Orchestrator. Splits the ticket and names a department for each issue.">
          <CodeView code={plan} lang="json" />
        </Stage>

        <Stage
          title={result.sent.length > 1 ? `Writers: ${result.sent.length} calls at once` : 'Writer'}
          note="Routing and workers. Each issue goes to its department's ChatClient, on a virtual thread each."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {result.sent.map((issue, i) => (
              <div key={i} className="min-w-0 rounded-md border border-slate-200 p-2.5 text-sm dark:border-slate-700/70">
                <p className={'code-mono text-[0.75rem] font-medium ' + DEPARTMENT_STYLE[issue.department]}>{issue.department}</p>
                <p className="mt-1 text-slate-700 dark:text-slate-300">{issue.answer}</p>
              </div>
            ))}
            {result.dropped.map((issue, i) => (
              <div key={'d' + i} className="min-w-0 rounded-md border border-dashed border-rose-300 p-2.5 text-sm dark:border-rose-800/70">
                <p className="code-mono text-[0.75rem] font-medium text-rose-700 dark:text-rose-300">Not sent</p>
                <p className="mt-1 text-slate-700 dark:text-slate-300">
                  “{issue.question}” is issue {MAX_ISSUES + 1 + i}, and MAX_ISSUES is {MAX_ISSUES}.
                </p>
              </div>
            ))}
          </div>
        </Stage>

        {result.sent.length > 1 && (
          <Stage title="Editor merges the answers" note="One reply, one greeting, in the order of the plan.">
            <p className="text-sm text-slate-700 dark:text-slate-300">{ticket.merged}</p>
          </Stage>
        )}

        {result.rounds.map((round, i) => (
          <Stage key={i} title={`Reviewer, round ${i + 1}: entity(Review.class)`} note={i === 0 ? 'Evaluator. The editor is the optimizer.' : undefined}>
            <CodeView
              code={JSON.stringify(round.problem === null ? { approved: true, problems: [] } : { approved: false, problems: [round.problem] })}
              lang="json"
            />
            {round.problem !== null && i < result.rounds.length - 1 && (
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">Editor revises: </span>
                {result.rounds[i + 1].draft}
              </p>
            )}
            {round.problem !== null && i === result.rounds.length - 1 && (
              <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">Round {i + 1} is the last one, so the draft goes to an agent as it is.</p>
            )}
          </Stage>
        ))}

        <Stage title="ReplyDraft" note={`${result.modelCalls} model calls. An agent reviews every draft before it is sent.`}>
          <CodeView code={JSON.stringify(draft, null, 2)} lang="json" />
        </Stage>
      </ol>
    </LabFrame>
  );
}
