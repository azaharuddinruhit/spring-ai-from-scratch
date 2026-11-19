package com.example.support.ticket;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.example.support.ScriptedChatModel;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;

class TicketReplyServiceTest {

    private static final String APPROVED = """
            {
              "approved": true,
              "problems": []
            }""";

    private final ScriptedChatModel billing = replies("You were charged twice; a refund is waiting in the app.");
    private final ScriptedChatModel technical = replies("Please send the request id of a failing call.");
    private final ScriptedChatModel account = replies("Go to Settings, then Users, then Invite.");
    private final ScriptedChatModel editor = replies("Merged reply", "Revised reply");

    @Test
    void sendsASingleIssueStraightToItsDepartment() {
        var service = service(plan("TECHNICAL"), replies(APPROVED));

        ReplyDraft draft = service.draftReply("502 errors", "Every call to /v1/chat fails since 9:00.");

        assertThat(draft).isEqualTo(new ReplyDraft(List.of(Department.TECHNICAL), "Please send the request id of a failing call.", 1, false));
        assertThat(billing.prompts()).isEmpty();
        assertThat(editor.prompts()).isEmpty();
    }

    @Test
    void answersEachIssueWithItsDepartmentAndMergesTheAnswers() {
        var service = service(plan("BILLING", "ACCOUNT"), replies(APPROVED));

        ReplyDraft draft = service.draftReply("Two things", "I was charged twice, and how do I add a colleague?");

        assertThat(draft.reply()).isEqualTo("Merged reply");
        assertThat(draft.departments()).containsExactly(Department.BILLING, Department.ACCOUNT);
        assertThat(billing.prompts().getFirst().getUserMessage().getText()).startsWith("Answer only this part of the ticket: BILLING question");
        assertThat(editor.prompts().getFirst().getUserMessage().getText())
                .contains("You were charged twice; a refund is waiting in the app.", "Go to Settings, then Users, then Invite.");
        assertThat(technical.prompts()).isEmpty();
    }

    @Test
    void capsTheNumberOfWorkers() {
        ScriptedChatModel everyBilling = new ScriptedChatModel(prompt -> new AssistantMessage("part"));
        var service = new TicketReplyService(client(replies(plan("BILLING", "BILLING", "BILLING", "BILLING", "BILLING", "BILLING"))),
                Map.of(Department.BILLING, client(everyBilling), Department.TECHNICAL, client(technical), Department.ACCOUNT, client(account)),
                client(editor), client(replies(APPROVED)));

        service.draftReply("Many", "Six billing questions");

        assertThat(everyBilling.prompts()).hasSize(TicketReplyService.MAX_ISSUES);
    }

    @Test
    void revisesTheReplyWithTheReviewersProblems() {
        var service = service(plan("BILLING", "ACCOUNT"), replies("""
                {
                  "approved": false,
                  "problems": [
                    "It promises the refund by Friday."
                  ]
                }""", APPROVED));

        ReplyDraft draft = service.draftReply("Two things", "Charged twice; add a colleague?");

        assertThat(draft.reply()).isEqualTo("Revised reply");
        assertThat(draft.rounds()).isEqualTo(2);
        assertThat(editor.prompts().getLast().getUserMessage().getText()).contains("Merged reply", "- It promises the refund by Friday.");
    }

    @Test
    void handsTheReplyToAnAgentWhenTheReviewerNeverApproves() {
        ScriptedChatModel stubbornEditor = new ScriptedChatModel(prompt -> new AssistantMessage("Another try"));
        var service = new TicketReplyService(client(replies(plan("ACCOUNT"))),
                Map.of(Department.BILLING, client(billing), Department.TECHNICAL, client(technical), Department.ACCOUNT, client(account)),
                client(stubbornEditor),
                client(new ScriptedChatModel(prompt -> new AssistantMessage("""
                        {
                          "approved": false,
                          "problems": [
                            "Promises a date."
                          ]
                        }"""))));

        ReplyDraft draft = service.draftReply("Locked out", "I can't sign in.");

        assertThat(draft.rounds()).isEqualTo(TicketReplyService.MAX_ROUNDS);
        assertThat(draft.needsAgent()).isTrue();
        assertThat(stubbornEditor.prompts()).hasSize(TicketReplyService.MAX_ROUNDS - 1);
    }

    @Test
    void needsAWriterForEveryDepartment() {
        assertThatThrownBy(() -> new TicketReplyService(client(editor), Map.of(Department.BILLING, client(billing)), client(editor), client(editor)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private TicketReplyService service(String plan, ScriptedChatModel reviewer) {
        return new TicketReplyService(client(replies(plan)),
                Map.of(Department.BILLING, client(billing), Department.TECHNICAL, client(technical), Department.ACCOUNT, client(account)),
                client(editor), client(reviewer));
    }

    /** A plan with one issue per department given, each phrased as "DEPARTMENT question". */
    private static String plan(String... departments) {
        return List.of(departments).stream()
                .map(department -> "{\"department\": \"%s\", \"question\": \"%s question\"}".formatted(department, department))
                .collect(Collectors.joining(", ", "{\"issues\": [", "]}"));
    }

    /** Answers with each reply in turn. */
    private static ScriptedChatModel replies(String... replies) {
        Iterator<String> next = List.of(replies).iterator();
        return new ScriptedChatModel(prompt -> new AssistantMessage(next.next()));
    }

    private static ChatClient client(ScriptedChatModel model) {
        return ChatClient.builder(model).build();
    }
}
