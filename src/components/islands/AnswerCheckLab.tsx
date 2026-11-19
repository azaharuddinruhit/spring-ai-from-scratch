import { useState } from 'react';
import { CodeView, LabFrame, Pill } from './LabFrame';

/*
 * Recorded, not invented (lesson-src/module-6/probes): llama3.2:3b in Ollama answered the same question five times at
 * temperature 0.8, with the support app's system prompt and the 2.0.2 ContextualQueryAugmenter template around the refunds
 * chunk. The judge replies are llama3.2:3b's real replies to the exact 2.0.2 RelevancyEvaluator and FactCheckingEvaluator
 * prompts. Both evaluators pass only when the whole reply, stripped, equals "yes" ignoring case.
 */

const QUESTION = 'I bought a router three weeks ago and I want my money back. Can I still get a refund, and when will I see it?';
const CHUNK =
  'You can ask for a refund within 30 days of purchase. We send the money back to the card you paid with. Refunds reach your card 5 to 7 business days after we approve them. Your bank may take a little longer to show the credit.';

type Label = 'correct' | 'incomplete' | 'wrong';

interface Run {
  answer: string;
  label: Label;
  why: string;
  relevancy: string;
  factChecking: string;
}

const RUNS: Run[] = [
  {
    answer:
      "You can still get a refund, as long as it's within 30 days of purchase.\n\nRefunds reach your card 5 to 7 business days after we approve them. Your bank may take a little longer to show the credit.",
    label: 'correct',
    why: 'Both parts answered from the document.',
    relevancy: 'NO',
    factChecking:
      'Yes. The claim is supported by the document. The document explicitly states that refunds can be requested within 30 days of purchase, and also provides additional information about the timeframe for refunds to be processed and credited back to the card.',
  },
  {
    answer:
      'Yes, you can still get a refund. You can ask for a refund within 30 days of purchase. Since you bought the router three weeks ago, you still have time to request a refund.',
    label: 'incomplete',
    why: 'Never says when the money arrives.',
    relevancy: 'NO',
    factChecking:
      'Yes. The claim is supported by the document. The document explicitly states that you can ask for a refund within 30 days of purchase, and the claim is made by someone who has purchased the router within that timeframe.',
  },
  {
    answer:
      'Yes, you can still get a refund within 30 days of purchase. Since you bought the router three weeks ago, you should be able to get a refund. Refunds typically reach your card 5 to 7 business days after we approve them.',
    label: 'correct',
    why: 'Both parts answered from the document.',
    relevancy: 'NO',
    factChecking:
      'No. The document states that refunds reach your card 5 to 7 business days after approval, but it does not guarantee that refunds will be approved within 30 days of purchase.',
  },
  {
    answer:
      'Yes, you can still get a refund. You can ask for a refund within 30 days of purchase, and you bought the router three weeks ago, so you should still be eligible for a refund. Refunds reach your card 5 to 7 business days after we approve them, so you should see the credit on your card within that timeframe.',
    label: 'correct',
    why: 'Both parts answered from the document.',
    relevancy: 'NO',
    factChecking:
      'Yes. The document directly supports the claim by stating that refunds can be requested within 30 days of purchase and that refunds reach the card 5 to 7 business days after approval.',
  },
  {
    answer:
      'You can still get a refund within 30 days of purchase, which is 3 weeks from the date of purchase. Refunds reach your card 5 to 7 business days after we approve them, so if you submit your refund request now, you should see the credit in 12 to 18 business days.',
    label: 'wrong',
    why: 'Says 30 days is 3 weeks, and invents "12 to 18 business days".',
    relevancy: 'NO',
    factChecking:
      'No. The claim is not supported by the document. The document states that refunds reach your card 5 to 7 business days after approval, but it does not provide a specific timeframe for when the credit will be shown to the bank, which is what the claim is asking for.',
  },
];

type CheckId = 'exact' | 'days' | 'business' | 'relevancy' | 'factChecking';

interface Check {
  label: string;
  code: string;
  /** For a judge check, the judge's raw reply; otherwise whether the assertion holds. */
  judge?: (run: Run) => string;
  holds?: (answer: string) => boolean;
}

const JUDGE_SETUP = `ChatClient.Builder judge = chatClientBuilder
        .defaultOptions(ChatOptions.builder().model(judgeModel).temperature(0.0));
var request = new EvaluationRequest(question, answer.sources(), answer.text());`;

const CHECKS: Record<CheckId, Check> = {
  exact: {
    label: 'isEqualTo(...)',
    code: `assertThat(answer.text()).isEqualTo("""
        You can still get a refund, as long as it's within 30 days of purchase.

        Refunds reach your card 5 to 7 business days after we approve them. Your bank may take a little longer to show the credit.""");`,
    holds: (answer) => answer === RUNS[0].answer,
  },
  days: {
    label: 'contains("30 days")',
    code: 'assertThat(answer.text()).contains("30 days");',
    holds: (answer) => answer.includes('30 days'),
  },
  business: {
    label: 'contains("5 to 7 business days")',
    code: 'assertThat(answer.text()).contains("5 to 7 business days");',
    holds: (answer) => answer.includes('5 to 7 business days'),
  },
  relevancy: {
    label: 'RelevancyEvaluator',
    code: `${JUDGE_SETUP}

assertThat(new RelevancyEvaluator(judge).evaluate(request).isPass()).isTrue();`,
    judge: (run) => run.relevancy,
  },
  factChecking: {
    label: 'FactCheckingEvaluator',
    code: `${JUDGE_SETUP}

assertThat(FactCheckingEvaluator.builder(judge).build().evaluate(request).isPass()).isTrue();`,
    judge: (run) => run.factChecking,
  },
};

/** What RelevancyEvaluator and FactCheckingEvaluator do with the judge's reply. */
const springAiPasses = (reply: string) => reply.trim().toLowerCase() === 'yes';

const LABEL_TEXT: Record<Label, string> = { correct: 'Correct', incomplete: 'Incomplete', wrong: 'Wrong' };

export default function AnswerCheckLab() {
  const [checkId, setCheckId] = useState<CheckId>('business');
  const check = CHECKS[checkId];

  const results = RUNS.map((run) => (check.judge ? springAiPasses(check.judge(run)) : check.holds!(run.answer)));
  const passed = results.filter(Boolean).length;
  const agrees = RUNS.filter((run, i) => results[i] === (run.label === 'correct')).length;
  const wrongPasses = results[4];

  return (
    <LabFrame
      title="Test the answer, not the wording"
      hint="Recorded from llama3.2:3b in Ollama: the same question five times, then a 3B judge. Pick a check and see which runs it passes."
    >
      <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700/70">
        <p className="text-slate-800 dark:text-slate-200">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Customer </span>
          {QUESTION}
        </p>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">refunds.md, the one chunk retrieved </span>
          {CHUNK}
        </p>
      </div>

      <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">The check</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {(Object.keys(CHECKS) as CheckId[]).map((id) => (
          <Pill key={id} active={id === checkId} onClick={() => setCheckId(id)}>
            {CHECKS[id].label}
          </Pill>
        ))}
      </div>
      <CodeView code={check.code} lang="java" className="mt-3" />

      <p className="mt-4 text-sm text-slate-800 dark:text-slate-200" aria-live="polite">
        Passes <span className="font-medium tabular-nums">{passed} of 5</span> runs. Agrees with your labels on{' '}
        <span className="font-medium tabular-nums">{agrees} of 5</span>, and{' '}
        {wrongPasses ? (
          <span className="font-medium text-rose-700 dark:text-rose-300">lets the wrong answer through</span>
        ) : (
          <span className="font-medium text-brand-700 dark:text-brand-300">fails the wrong answer</span>
        )}
        .
      </p>

      <ol className="mt-3 space-y-2">
        {RUNS.map((run, i) => {
          const pass = results[i];
          const reply = check.judge?.(run);
          return (
            <li key={i} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700/70">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Run {i + 1}
                  <span
                    className={
                      'ml-2 rounded px-1.5 py-0.5 ' +
                      (run.label === 'correct'
                        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300')
                    }
                  >
                    Your label: {LABEL_TEXT[run.label]}
                  </span>
                </p>
                <p
                  className={
                    'text-xs font-semibold ' + (pass ? 'text-brand-700 dark:text-brand-300' : 'text-rose-700 dark:text-rose-300')
                  }
                >
                  {pass ? 'Pass' : 'Fail'}
                </p>
              </div>
              <p className="mt-1.5 whitespace-pre-line text-slate-800 dark:text-slate-200">{run.answer}</p>
              {run.label !== 'correct' && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{run.why}</p>}
              {reply !== undefined && (
                <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">The judge replied</p>
                  <p className="code-mono mt-0.5 text-[0.75rem] text-slate-700 dark:text-slate-300">{reply}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {springAiPasses(reply)
                      ? 'A bare "yes": Spring AI counts it as a pass.'
                      : reply.toLowerCase().startsWith('yes')
                        ? 'It means yes, but it is not the bare word "yes", so Spring AI counts it as a fail.'
                        : 'Spring AI counts it as a fail.'}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 text-sm text-slate-700 dark:text-slate-300">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">What this check tells you</p>
        <p className="mt-1">
          {checkId === 'exact' &&
            'Only the run it was copied from passes. Correct answers fail because the wording changed, so the test is flaky and proves nothing.'}
          {checkId === 'days' &&
            'Every run passes, the wrong one too. A fact every answer repeats catches nothing.'}
          {checkId === 'business' &&
            'Stable on wording, and it fails the run that never says when the money arrives. But the wrong answer passes: it contains the right phrase and then adds a made-up number.'}
          {checkId === 'relevancy' &&
            'The 3B judge said NO to everything, correct answers included. A judge as small as the model it grades is no judge.'}
          {checkId === 'factChecking' &&
            'The judge answered in sentences, so even its yeses fail: Spring AI only accepts the bare word. Its sentences were also wrong once (run 3). Use a stronger judge, and check it against labelled answers before you trust it.'}
        </p>
      </div>
    </LabFrame>
  );
}
