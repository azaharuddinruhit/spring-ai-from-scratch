import { useState } from 'react';
import type { ReactNode } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * Two users chat through Spring AI 2.1 session memory on the JDBC repository (PostgreSQL), as the lesson configures it: the
 * memory advisor at HIGHEST_PRECEDENCE + 210 with an event filter. Checked against the real classes:
 * - The memory advisor sends the system message, the stored events the filter picks and the new message, then saves the message
 *   and the reply as events. The session keeps every event; EventFilter.lastN(n) only limits what is sent (it extends back to
 *   the start of a turn, and every turn here is one user and one assistant message). The default filter is EventFilter.all().
 * - A call without a session id fails with IllegalStateException before anything is stored or sent.
 * - SessionService.delete removes the session row, and ON DELETE CASCADE removes its events.
 * The derived ids are UUID.nameUUIDFromBytes((userId + ":" + chatId).getBytes(UTF_8)), computed with the JDK.
 */

type User = 'alice' | 'bob';
type Strategy = 'derived' | 'chat' | 'none';
type Window = 4 | 6 | 'all';
type Role = 'system' | 'user' | 'assistant';
type Msg = { role: Role; text: string };

const CHAT_ID = '0f8e2a4c-6b1d-4c3e-9a7f-5d2b8c1e4a60';
const DERIVED: Record<User, string> = {
  alice: '8f94891c-9b64-3e5a-8d60-e6719b4d1d37',
  bob: '95e62ec5-0a98-30ee-9563-e30885f7aafb',
};
const SYSTEM: Msg = { role: 'system', text: 'You are the support assistant for Acme Cloud.' };
const NAMES: Record<User, string> = { alice: 'Alice', bob: 'Bob' };

const STRATEGIES: Record<Strategy, { label: string; param: string | null }> = {
  derived: { label: 'UUID from user and chat', param: 'sessionId(userId, chatId)' },
  chat: { label: 'The chat id from the URL', param: 'chatId.toString()' },
  none: { label: 'No session id', param: null },
};

const SUGGESTIONS: Record<User, string[]> = {
  alice: ['My order number is 1042.', 'What is my order number?', 'The router arrived damaged.'],
  bob: ['What is my order number?', 'My order number is 2077.', 'Can I change my plan?'],
};

function conversationIdFor(strategy: Strategy, user: User): string | null {
  switch (strategy) {
    case 'derived':
      return DERIVED[user];
    case 'chat':
      return CHAT_ID;
    case 'none':
      return null;
  }
}

function modelReply(prompt: Msg[]): string {
  const question = prompt[prompt.length - 1].text;
  const stated = question.match(/order number is (\d+)/i);
  if (stated) return `Thanks, I've noted order ${stated[1]}.`;
  if (/what is my order number/i.test(question)) {
    const earlier = prompt
      .slice(0, -1)
      .filter((m) => m.role === 'user')
      .map((m) => m.text.match(/order number is (\d+)/i))
      .filter((m): m is RegExpMatchArray => m !== null)
      .pop();
    return earlier ? `Your order number is ${earlier[1]}.` : "I don't know your order number yet. Could you tell me?";
  }
  return 'Thanks. Let me look into that for you.';
}

interface Row {
  conversationId: string;
  role: Exclude<Role, 'system'>;
  text: string;
}

interface Exchange {
  user: User;
  text: string;
  reply?: string;
  error?: string;
}

const MISSING_ID =
  'IllegalStateException: No session ID found in advisor context. Set SESSION_ID_CONTEXT_KEY on every request: …';

function javaFor(strategy: Strategy, eventWindow: Window): string {
  const param = STRATEGIES[strategy].param;
  const params = param ? `\n                .advisors(SessionAdvisors.session(${param}))` : '';
  const filter = eventWindow === 'all' ? '' : `\n                        .eventFilter(EventFilter.lastN(${eventWindow}))`;
  return `.defaultAdvisors(SessionAdvisors.builder(sessionService)
                .memory(memory -> memory.order(Ordered.HIGHEST_PRECEDENCE + 210)${filter})
                .build())

String answer = supportChatClient.prompt()
        .user(question)${params}
        .call()
        .content();`;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 p-3 dark:border-slate-700/70">
      <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">{title}</h4>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function ChatMemoryLab() {
  const [strategy, setStrategy] = useState<Strategy>('derived');
  const [eventWindow, setEventWindow] = useState<Window>(4);
  const [user, setUser] = useState<User>('alice');
  const [rows, setRows] = useState<Row[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [lastPrompt, setLastPrompt] = useState<Msg[]>([]);

  const conversationId = conversationIdFor(strategy, user);

  const send = (text: string) => {
    if (conversationId === null) {
      setExchanges((e) => [...e, { user, text, error: MISSING_ID }]);
      return;
    }
    const stored: Msg[] = rows.filter((r) => r.conversationId === conversationId).map((r) => ({ role: r.role, text: r.text }));
    const sent = eventWindow === 'all' ? stored : stored.slice(-eventWindow);
    const prompt: Msg[] = [SYSTEM, ...sent, { role: 'user', text }];
    const reply = modelReply(prompt);
    setRows((all) => [
      ...all,
      { conversationId, role: 'user' as const, text },
      { conversationId, role: 'assistant' as const, text: reply },
    ]);
    setExchanges((e) => [...e, { user, text, reply }]);
    setLastPrompt(prompt);
  };

  const forget = () => {
    if (conversationId === null) return;
    setRows((all) => all.filter((r) => r.conversationId !== conversationId));
    setExchanges((e) => [...e, { user, text: 'DELETE /api/chats/' + CHAT_ID, reply: `sessionService.delete("${conversationId}") removed the session, and its events with it.` }]);
  };

  const reset = () => {
    setRows([]);
    setExchanges([]);
    setLastPrompt([]);
  };

  return (
    <LabFrame
      title="Session ids and the event filter"
      hint="Alice and Bob both open chat 0f8e2a4c-… in the app. Choose how the service turns that into a session id, then chat as either user."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Session id</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(Object.keys(STRATEGIES) as Strategy[]).map((s) => (
              <Pill key={s} active={strategy === s} onClick={() => setStrategy(s)}>
                {STRATEGIES[s].label}
              </Pill>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Event filter</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {([4, 6, 'all'] as Window[]).map((n) => (
              <Pill key={n} active={eventWindow === n} onClick={() => setEventWindow(n)}>
                {n === 'all' ? 'all() (default)' : `lastN(${n})`}
              </Pill>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="text-xs font-medium text-slate-600 dark:text-slate-400">Signed in as</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(['alice', 'bob'] as User[]).map((u) => (
              <Pill key={u} active={user === u} onClick={() => setUser(u)}>
                {NAMES[u]}
              </Pill>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400">Your code</h4>
        <CodeView code={javaFor(strategy, eventWindow)} lang="java" className="mt-1.5" />
        <p className="mt-2 text-sm text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">
          {NAMES[user]}'s session id:{' '}
          <span className="code-mono text-[0.8rem] text-slate-800 dark:text-slate-200">{conversationId ?? 'none'}</span>
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{NAMES[user]} says:</span>
          {SUGGESTIONS[user].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700 hover:border-brand-500 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-brand-300"
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={forget}
            disabled={conversationId === null}
            className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:border-rose-500 hover:text-rose-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
          >
            Forget this chat
          </button>
          <button type="button" onClick={reset} disabled={!exchanges.length} className="ml-auto text-xs text-slate-500 hover:text-brand-700 disabled:opacity-40">
            Start over
          </button>
        </div>

        <div role="log" aria-live="polite" className="space-y-2">
          {exchanges.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Pick a message to send.</p>}
          {exchanges.map((x, i) => (
            <div key={i} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700/70">
              <p className="text-slate-800 [overflow-wrap:anywhere] dark:text-slate-200">
                <span className="font-medium">{NAMES[x.user]}: </span>
                {x.text}
              </p>
              {x.reply && <p className="mt-1 text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{x.reply}</p>}
              {x.error && <p className="code-mono mt-1 text-[0.8rem] text-rose-700 [overflow-wrap:anywhere] dark:text-rose-300">{x.error}</p>}
            </div>
          ))}
        </div>

        <Panel title={`AI_SESSION_EVENT (${rows.length} rows)`}>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.8rem]">
                <thead className="text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-1 pr-3 font-medium">session_id</th>
                    <th className="py-1 pr-3 font-medium">message_type</th>
                    <th className="py-1 font-medium">message_content</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className={
                        'border-t border-slate-200 align-top dark:border-slate-700/70 ' +
                        (r.conversationId === conversationId ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-500')
                      }
                    >
                      <td className="code-mono py-1 pr-3 whitespace-nowrap">{r.conversationId.slice(0, 8)}…</td>
                      <td className="code-mono py-1 pr-3">{r.role.toUpperCase()}</td>
                      <td className="py-1 [overflow-wrap:anywhere]">{r.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">The table is empty.</p>
          )}
        </Panel>
        <Panel title="What the model received last">
          {lastPrompt.length ? (
            <ol className="space-y-1.5">
              {lastPrompt.map((m, i) => (
                <li key={i} className="flex gap-2 text-sm leading-snug">
                  <span className="code-mono w-16 shrink-0 text-[0.75rem] uppercase text-slate-500 dark:text-slate-400">{m.role}</span>
                  <span className="min-w-0 [overflow-wrap:anywhere] text-slate-700 dark:text-slate-300">{m.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">The model hasn't been called.</p>
          )}
        </Panel>
      </div>
    </LabFrame>
  );
}
