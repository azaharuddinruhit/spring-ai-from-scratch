package com.example.support.ticket;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.util.Assert;

/**
 * Three workflow patterns in one: a planner splits the ticket into issues (orchestrator), each issue goes to its
 * department's writer (routing) and the writers run in parallel (workers); then a reviewer sends the merged reply back
 * to the editor until it approves, at most {@value #MAX_ROUNDS} times (evaluator-optimizer). The code owns the control
 * flow; the model fills in each step.
 */
public class TicketReplyService {

    static final int MAX_ISSUES = 4;
    static final int MAX_ROUNDS = 3;

    private static final String ANSWER = """
            Answer only this part of the ticket: {question}

            The whole ticket, for context:
            {ticket}""";

    private static final String MERGE = """
            Merge these answers into one reply to the ticket, in the order given.

            Ticket:
            {ticket}

            Answers:
            {answers}""";

    private static final String REVIEW = """
            Ticket:
            {ticket}

            Draft reply:
            {reply}""";

    private static final String REVISE = """
            Rewrite this reply so that it fixes every problem listed.

            Ticket:
            {ticket}

            Reply:
            {reply}

            Problems:
            {problems}""";

    private final ChatClient planner;
    private final Map<Department, ChatClient> writers;
    private final ChatClient editor;
    private final ChatClient reviewer;

    TicketReplyService(ChatClient planner, Map<Department, ChatClient> writers, ChatClient editor, ChatClient reviewer) {
        Assert.isTrue(writers.keySet().containsAll(EnumSet.allOf(Department.class)), "Every department needs a writer");
        this.planner = planner;
        this.writers = Map.copyOf(writers);
        this.editor = editor;
        this.reviewer = reviewer;
    }

    public ReplyDraft draftReply(String subject, String body) {
        String ticket = "Subject: " + subject + "\n\n" + body;
        Plan plan = Objects.requireNonNull(planner.prompt().user(ticket).call().entity(Plan.class), "No plan");
        // The model decides how many workers run, so cap the fan-out.
        List<Issue> issues = plan.issues().stream().limit(MAX_ISSUES).toList();
        Assert.state(!issues.isEmpty(), "The planner found no issue in the ticket");

        List<String> answers = answerInParallel(ticket, issues);
        String reply = answers.size() == 1 ? answers.getFirst() : editor.prompt()
                .user(user -> user.text(MERGE).param("ticket", ticket).param("answers", String.join("\n\n---\n\n", answers)))
                .call()
                .content();

        for (int round = 1; ; round++) {
            String draft = reply;
            Review review = Objects.requireNonNull(reviewer.prompt()
                    .user(user -> user.text(REVIEW).param("ticket", ticket).param("reply", draft))
                    .call()
                    .entity(Review.class), "No review");
            if (review.approved() || round == MAX_ROUNDS) {
                return new ReplyDraft(issues.stream().map(Issue::department).distinct().toList(), draft, round, !review.approved());
            }
            reply = editor.prompt()
                    .user(user -> user.text(REVISE)
                            .param("ticket", ticket)
                            .param("reply", draft)
                            .param("problems", "- " + String.join("\n- ", review.problems())))
                    .call()
                    .content();
        }
    }

    private List<String> answerInParallel(String ticket, List<Issue> issues) {
        try (ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor()) {
            List<CompletableFuture<String>> answers = issues.stream()
                    .map(issue -> CompletableFuture.supplyAsync(() -> writers.get(issue.department()).prompt()
                            .user(user -> user.text(ANSWER).param("question", issue.question()).param("ticket", ticket))
                            .call()
                            .content(), workers))
                    .toList();
            return answers.stream().map(CompletableFuture::join).toList();
        }
    }
}
