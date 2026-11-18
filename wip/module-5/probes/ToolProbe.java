import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import org.jspecify.annotations.Nullable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.*;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.tool.execution.DefaultToolExecutionExceptionProcessor;
import reactor.core.publisher.Flux;

public class ToolProbe {

    enum Priority { LOW, HIGH }
    record Address(String city, @Nullable String zip) {}

    static class Tools {
        final List<String> log = new ArrayList<>();

        @Tool(description = "Find one of the customer's orders")
        Map<String, Object> findOrder(@ToolParam(description = "Order number, such as 1042") String orderNumber, ToolContext context) {
            log.add("findOrder(" + orderNumber + ") context=" + context.getContext());
            if (orderNumber.equals("9999")) throw new IllegalStateException("JDBC: relation \"orders_v2\" does not exist at db-prod-3:5432");
            return Map.of("orderNumber", orderNumber, "status", "SHIPPED");
        }

        @Tool(description = "Open a ticket", returnDirect = true)
        String openTicket(String subject, @ToolParam(required = false) Priority priority, @Nullable Address address, int count, List<String> tags) {
            log.add("openTicket(" + subject + ")");
            return "Ticket INC-7 opened";
        }

        @Tool(name = "cancel_order")
        void cancel(String orderNumber) { log.add("cancel(" + orderNumber + ")"); }
    }

    /** Replies with the next scripted message each time it's called, recording what it saw. */
    static class ScriptedModel implements ChatModel {
        final Function<Prompt, AssistantMessage> script;
        final List<Prompt> seen = new ArrayList<>();
        ScriptedModel(Function<Prompt, AssistantMessage> script) { this.script = script; }
        public ChatResponse call(Prompt p) { seen.add(p); return new ChatResponse(List.of(new Generation(script.apply(p)))); }
        public Flux<ChatResponse> stream(Prompt p) { return Flux.just(call(p)); }
        public ChatOptions getOptions() { return ToolCallingChatOptions.builder().build(); }
    }

    static AssistantMessage calls(String... nameArgs) {
        List<AssistantMessage.ToolCall> list = new ArrayList<>();
        for (int i = 0; i < nameArgs.length; i += 2) list.add(new AssistantMessage.ToolCall("call-" + UUID.randomUUID().toString().substring(0, 4), "function", nameArgs[i], nameArgs[i + 1]));
        return AssistantMessage.builder().content("").toolCalls(list).build();
    }

    static String describe(Message m) {
        return switch (m) {
            case ToolResponseMessage t -> "TOOL" + t.getResponses().stream().map(r -> r.name() + "=" + r.responseData()).toList();
            case AssistantMessage a when a.hasToolCalls() -> "ASSISTANT calls " + a.getToolCalls().stream().map(c -> c.name() + c.arguments()).toList();
            default -> m.getMessageType() + ": " + m.getText();
        };
    }

    static void run(String title, ScriptedModel model, Tools tools, Function<ChatClient.Builder, ChatClient.Builder> customize, String user) {
        System.out.println("\n=== " + title);
        var memory = MessageWindowChatMemory.builder().build();
        var builder = ChatClient.builder(model)
                .defaultSystem("You are the support assistant.")
                .defaultAdvisors(MessageChatMemoryAdvisor.builder(memory).build())
                .defaultTools(tools);
        var client = customize.apply(builder).build();
        try {
            ChatResponse r = client.prompt().user(user)
                    .toolContext(Map.of("customerId", "cust-42"))
                    .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, "c1"))
                    .call().chatResponse();
            System.out.println("content: " + r.getResult().getOutput().getText());
            System.out.println("finishReason: " + r.getResult().getMetadata().getFinishReason());
        } catch (Exception e) {
            System.out.println("THREW " + e.getClass().getName() + ": " + e.getMessage());
        }
        System.out.println("model calls: " + model.seen.size());
        for (int i = 0; i < Math.min(model.seen.size(), 4); i++) {
            Prompt p = model.seen.get(i);
            var opts = (ToolCallingChatOptions) p.getOptions();
            System.out.println("  call " + (i + 1) + " messages: " + p.getInstructions().stream().map(ToolProbe::describe).toList());
            if (i == 0) System.out.println("  call 1 toolContext in options: " + opts.getToolContext() + " tools: " + opts.getToolCallbacks().stream().map(t -> t.getToolDefinition().name()).toList());
        }
        System.out.println("tool log: " + tools.log);
        System.out.println("memory: " + memory.get("c1").stream().map(ToolProbe::describe).toList());
    }

    public static void main(String[] args) {
        for (ToolCallback cb : ToolCallbacks.from(new Tools())) {
            var d = cb.getToolDefinition();
            System.out.println(d.name() + " | " + d.description() + " | returnDirect=" + cb.getToolMetadata().returnDirect());
            System.out.println("  " + d.inputSchema().replaceAll("\\s+", " "));
        }

        // 1. Normal loop.
        var t1 = new Tools();
        run("normal", new ScriptedModel(p -> p.getInstructions().getLast() instanceof ToolResponseMessage
                ? new AssistantMessage("Order 1042 has shipped.") : calls("findOrder", "{\"orderNumber\":\"1042\"}")), t1, b -> b, "Where is order 1042?");

        // 2. The tool throws.
        run("tool throws", new ScriptedModel(p -> p.getInstructions().getLast() instanceof ToolResponseMessage t
                ? new AssistantMessage("Sorry: " + t.getResponses().getFirst().responseData()) : calls("findOrder", "{\"orderNumber\":\"9999\"}")), new Tools(), b -> b, "Where is order 9999?");

        // 3. Unknown tool name.
        run("unknown tool", new ScriptedModel(p -> p.getInstructions().getLast() instanceof ToolResponseMessage
                ? new AssistantMessage("done") : calls("findOrders", "{}")), new Tools(), b -> b, "x");

        // 4. Runaway loop with the default limits (40 per tool) and THROW.
        run("runaway, defaults", new ScriptedModel(p -> calls("findOrder", "{\"orderNumber\":\"1042\"}")), new Tools(), b -> b, "loop");

        // 5. Limit 3 per tool, THROW.
        Function<ToolCallLimitBehavior, ToolCallingManager> mgr = behavior -> DefaultToolCallingManager.builder().maxCallsPerTool(3).onLimitExceeded(behavior).build();
        run("limit 3, THROW", new ScriptedModel(p -> calls("findOrder", "{\"orderNumber\":\"1042\"}")), new Tools(),
                b -> b.defaultAdvisors(org.springframework.ai.chat.client.advisor.ToolCallingAdvisor.builder().toolCallingManager(mgr.apply(ToolCallLimitBehavior.THROW)).build()), "loop");

        // 6. Limit 3 per tool, RETURN_ERROR_RESPONSE, model stops on its own after 60 calls.
        AtomicInteger n = new AtomicInteger();
        run("limit 3, RETURN_ERROR_RESPONSE", new ScriptedModel(p -> n.incrementAndGet() > 60 ? new AssistantMessage("giving up") : calls("findOrder", "{\"orderNumber\":\"1042\"}")), new Tools(),
                b -> b.defaultAdvisors(org.springframework.ai.chat.client.advisor.ToolCallingAdvisor.builder().toolCallingManager(mgr.apply(ToolCallLimitBehavior.RETURN_ERROR_RESPONSE)).build()), "loop");

        // 7. returnDirect.
        run("returnDirect", new ScriptedModel(p -> calls("openTicket", "{\"subject\":\"Router broken\",\"count\":1,\"tags\":[]}")), new Tools(), b -> b, "Open a ticket");

        // 8. Two calls in one reply, one returnDirect and one not.
        run("mixed returnDirect", new ScriptedModel(p -> p.getInstructions().getLast() instanceof ToolResponseMessage
                ? new AssistantMessage("both done") : calls("openTicket", "{\"subject\":\"a\",\"count\":1,\"tags\":[]}", "findOrder", "{\"orderNumber\":\"1042\"}")), new Tools(), b -> b, "both");

        // 9. Void tool.
        run("void tool", new ScriptedModel(p -> p.getInstructions().getLast() instanceof ToolResponseMessage
                ? new AssistantMessage("cancelled") : calls("cancel_order", "{\"orderNumber\":\"1042\"}")), new Tools(), b -> b, "cancel");

        // 10. Tool throws, with rethrow configured.
        run("tool throws, rethrow", new ScriptedModel(p -> calls("findOrder", "{\"orderNumber\":\"9999\"}")), new Tools(),
                b -> b.defaultAdvisors(org.springframework.ai.chat.client.advisor.ToolCallingAdvisor.builder().toolCallingManager(
                        DefaultToolCallingManager.builder().toolExecutionExceptionProcessor(DefaultToolExecutionExceptionProcessor.builder().alwaysThrow(true).build()).build()).build()), "x");

        // 11. Model sends a customerId argument of its own: does it reach ToolContext?
        var t11 = new Tools();
        run("model passes extra args", new ScriptedModel(p -> p.getInstructions().getLast() instanceof ToolResponseMessage
                ? new AssistantMessage("ok") : calls("findOrder", "{\"orderNumber\":\"1042\",\"customerId\":\"cust-1\"}")), t11, b -> b, "x");
    }
}
