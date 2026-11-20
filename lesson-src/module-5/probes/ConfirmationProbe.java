import java.util.List;
import java.util.Map;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallDecision;
import org.springframework.ai.model.tool.ToolCallDecisions;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.session.DefaultSessionService;
import org.springframework.ai.session.InMemorySessionRepository;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.core.Ordered;

/** Tool call confirmation on 2.1.0: what executeToolCalls refuses, and what the session keeps when a new message closes a pause. */
public class ConfirmationProbe {

    public static class Tools {
        @Tool(description = "Refund an order", requiresConfirmation = true)
        public String refund(String orderNumber) { System.out.println("  REFUND TOOL RAN " + orderNumber); return "refunded " + orderNumber; }

        @Tool(description = "Look up an order")
        public String lookup(String orderNumber) { return "order " + orderNumber; }
    }

    static AssistantMessage calls(String... names) {
        return AssistantMessage.builder().content("")
                .toolCalls(java.util.Arrays.stream(names)
                        .map(n -> new AssistantMessage.ToolCall("call-" + n, "function", n, "{\"orderNumber\":\"1042\"}")).toList())
                .build();
    }

    static void attempt(String label, Runnable r) {
        try { r.run(); System.out.println(label + ": ok"); }
        catch (Exception e) { System.out.println(label + ": " + e.getClass().getSimpleName() + ": " + e.getMessage()); }
    }

    public static void main(String[] args) {
        var manager = ToolCallingManager.builder().build();
        var tools = ToolCallbacks.from(new Tools());
        var paused = calls("refund", "lookup");
        var response = new ChatResponse(List.of(new Generation(paused)));
        var keys = ToolCallDecisions.toolCallKeys(paused);
        System.out.println("keys: " + keys);
        var withTools = new Prompt(List.of(), ToolCallingChatOptions.builder().toolCallbacks(tools).build());
        attempt("one decision for two calls", () -> manager.executeToolCalls(withTools, response,
                ToolCallDecisions.of(ToolCallDecision.allow(keys.get(0)))));
        attempt("allowed call, no tools in prompt", () -> manager.executeToolCalls(new Prompt(List.of()), response,
                ToolCallDecisions.of(ToolCallDecision.allow(keys.get(0)), ToolCallDecision.allow(keys.get(1)))));
        attempt("denied calls, no tools in prompt", () -> {
            var r = manager.executeToolCalls(new Prompt(List.of()), response,
                    ToolCallDecisions.of(ToolCallDecision.deny(keys.get(0), "No."), ToolCallDecision.deny(keys.get(1))));
            System.out.println("  denied results: " + ((ToolResponseMessage) r.conversationHistory().getLast()).getResponses());
        });
        attempt("executeToolCalls without decisions on a confirmation tool", () -> manager.executeToolCalls(withTools,
                new ChatResponse(List.of(new Generation(calls("refund"))))));

        // A pause, then a new message instead of a decision.
        var sessions = DefaultSessionService.builder().sessionRepository(InMemorySessionRepository.builder().build()).build();
        int[] turn = {0};
        java.util.function.Function<Prompt, ChatResponse> script = prompt -> {
            System.out.println("  model call " + (++turn[0]) + " sees: " + prompt.getInstructions().stream()
                    .map(m -> m.getMessageType() + (m instanceof ToolResponseMessage t ? t.getResponses().toString() : "")).toList());
            boolean answered = prompt.getInstructions().getLast() instanceof ToolResponseMessage;
            String text = prompt.getUserMessage().getText();
            return new ChatResponse(List.of(new Generation(answered ? new AssistantMessage("ok")
                    : text.startsWith("Refund") ? calls("refund") : text.startsWith("Look up") ? calls("lookup") : new AssistantMessage("ok"))));
        };
        var model = new org.springframework.ai.chat.model.ChatModel() {
            public ChatResponse call(Prompt prompt) { return script.apply(prompt); }
            public reactor.core.publisher.Flux<ChatResponse> stream(Prompt prompt) { return reactor.core.publisher.Flux.just(script.apply(prompt)); }
            public org.springframework.ai.chat.prompt.ChatOptions getOptions() { return ToolCallingChatOptions.builder().build(); }
        };
        var client = ChatClient.builder(model)
                .defaultAdvisors(SessionAdvisors.builder(sessions).memory(m -> m.order(Ordered.HIGHEST_PRECEDENCE + 210)).build())
                .defaultTools(new Tools())
                .build();
        var first = client.prompt().user("Refund 1042").advisors(SessionAdvisors.session("s1")).call().chatResponse();
        System.out.println("paused: " + ToolCallDecisions.isAwaitingDecision(first) + " awaiting " + ToolCallDecisions.awaitingDecision(first)
                + " text '" + first.getResult().getOutput().getText() + "'");
        client.prompt().user("Never mind").advisors(SessionAdvisors.session("s1")).call().content();
        sessions.getMessages("s1").forEach(m -> System.out.println("  stored " + m.getMessageType()
                + (m instanceof ToolResponseMessage t ? " " + t.getResponses() : m instanceof UserMessage u ? " " + u.getText() : "")));
        var streamed = client.prompt().user("Refund 1043").advisors(SessionAdvisors.session("s2")).stream().chatResponse().collectList().block();
        var lastChunk = streamed.getLast();
        System.out.println("stream: " + streamed.size() + " chunks, last awaiting " + ToolCallDecisions.isAwaitingDecision(lastChunk)
                + ", any awaiting " + streamed.stream().anyMatch(ToolCallDecisions::isAwaitingDecision));
        sessions.getMessages("s2").forEach(m -> System.out.println("  s2 stored " + m.getMessageType()));
        client.prompt().user("Look up 1042").advisors(SessionAdvisors.session("s3")).call().content();
        sessions.getMessages("s3").forEach(m -> System.out.println("  s3 (plain tool loop, memory at +210) stored " + m.getMessageType()));
    }
}
