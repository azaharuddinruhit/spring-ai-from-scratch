package com.example.probe;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import com.example.support.tools.SupportTools;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.decision.DecisionModel;
import org.springframework.ai.decision.DecisionResponse;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.toolsearch.ToolIndex;
import org.springframework.ai.tool.toolsearch.ToolReference;
import org.springframework.ai.tool.toolsearch.ToolSearchRequest;
import org.springframework.ai.tool.toolsearch.index.decision.DecisionToolIndex;
import org.springframework.ai.tool.toolsearch.index.lucene.LuceneToolIndex;
import org.springframework.ai.tool.toolsearch.index.regex.RegexToolIndex;
import org.springframework.ai.tool.toolsearch.index.vectorstore.VectorToolIndex;
import org.springframework.ai.vectorstore.SimpleVectorStore;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Lesson 5.4 facts. Part A runs the four tool indexes directly on the lesson's ten tools. Part B drives the auto-configured
 * ToolSearchToolCallingAdvisor with a scripted chat model and prints what every model call carried.
 * Run with: --spring.ai.model.chat=none --spring.ai.model.embedding=ollama --spring.ai.model.decision=ollama
 * --spring.ai.chat.client.tool-search-advisor.enabled=true (and the other models off).
 */
@SpringBootApplication(scanBasePackages = "none")
public class ToolSearchFactsProbe {

    static final List<String> QUERIES = List.of(
            "Where is my order A-1042?", "order status", "track order delivery",
            "The kettle from order A-1042 leaks. I want to send it back.", "return item", "return label",
            "change delivery address", "Is the PB-200 blender in stock?", "check product stock availability",
            "cancel order", "weather forecast", "What's the weather in Paris tomorrow?");

    static final List<String> SCRIPT_CALLS = new ArrayList<>();
    static final AtomicInteger STEP = new AtomicInteger();

    /** Replies: search for "order status", call findOrder, answer. Records the tools and system text of every call. */
    @Bean
    @Primary
    ChatModel scriptedChatModel() {
        return new ChatModel() {
            @Override
            public org.springframework.ai.chat.prompt.ChatOptions getOptions() {
                return ToolCallingChatOptions.builder().build();
            }

            @Override
            public ChatResponse call(Prompt prompt) {
                return reply(prompt);
            }
        };
    }

    private static ChatResponse reply(Prompt prompt) {
        {
            var options = (ToolCallingChatOptions) prompt.getOptions();
            List<String> tools = options.getToolCallbacks().stream().map(c -> c.getToolDefinition().name()).toList();
            String system = prompt.getSystemMessage().getText();
            SCRIPT_CALLS.add("tools " + tools + " | system ends: "
                    + system.substring(Math.max(0, system.length() - 80)).replace("\n", "\\n"));
            AssistantMessage reply = switch (STEP.getAndIncrement() % 3) {
                case 0 -> AssistantMessage.builder().toolCalls(List.of(new AssistantMessage.ToolCall("c1", "function",
                        "toolSearchTool", "{\"query\":\"order status\"}"))).build();
                case 1 -> AssistantMessage.builder().toolCalls(List.of(new AssistantMessage.ToolCall("c2", "function",
                        "findOrder", "{\"orderId\":\"A-1042\"}"))).build();
                default -> AssistantMessage.builder().content("Shipped.").build();
            };
            return new ChatResponse(List.of(new Generation(reply)));
        }
    }

    public static void main(String[] args) {
        try (var context = new SpringApplicationBuilder(ToolSearchFactsProbe.class).web(WebApplicationType.NONE).run(args)) {
            List<ToolReference> references = new ArrayList<>();
            for (ToolCallback callback : ToolCallbacks.from(new SupportTools())) {
                references.add(ToolReference.builder().toolName(callback.getToolDefinition().name())
                        .summary(callback.getToolDefinition().description()).build());
            }
            DecisionModel decisionModel = context.getBean(DecisionModel.class);
            List<DecisionResponse> decisions = new ArrayList<>();
            DecisionModel recording = prompt -> {
                DecisionResponse response = decisionModel.call(prompt);
                decisions.add(response);
                return response;
            };
            Map<String, ToolIndex> indexes = new java.util.LinkedHashMap<>();
            indexes.put("regex", new RegexToolIndex());
            indexes.put("lucene", new LuceneToolIndex());
            indexes.put("lucene0", new LuceneToolIndex(0f));
            indexes.put("vector", new VectorToolIndex(SimpleVectorStore.builder(context.getBean(EmbeddingModel.class)).build()));
            indexes.put("decision", DecisionToolIndex.builder(recording).build());
            ToolIndex reversed = DecisionToolIndex.builder(recording).build();
            indexes.forEach((name, index) -> {
                long start = System.nanoTime();
                index.indexTools("s1", references);
                System.out.printf("PROBE index %s: indexed in %d ms%n", name, (System.nanoTime() - start) / 1_000_000);
            });
            reversed.indexTools("s1", references.reversed());
            indexes.put("decision-reversed", reversed);
            Function<List<ToolReference>, String> show = refs -> refs.stream()
                    .map(r -> r.toolName() + (r.relevanceScore() == null ? "" : String.format(" %.3f", r.relevanceScore())))
                    .toList().toString();
            for (String query : QUERIES) {
                System.out.println("PROBE query '" + query + "'");
                indexes.forEach((name, index) -> {
                    decisions.clear();
                    long start = System.nanoTime();
                    var response = index.search(new ToolSearchRequest("s1", query, null, null));
                    long millis = (System.nanoTime() - start) / 1_000_000;
                    String extra = "";
                    if (!decisions.isEmpty()) {
                        DecisionResponse d = decisions.getFirst();
                        var choice = d.getChoice("best_tool");
                        extra = String.format(" any_tool_applies %.3f best_tool %s %.3f, then %s", d.getYesNo("any_tool_applies").getProbability(),
                                choice.getValue(), choice.getProbability(), choice.getRankedOptions().subList(1, 3));
                    }
                    System.out.printf("PROBE   %-17s %4d ms %s total %s%s%n", name, millis, show.apply(response.toolReferences()),
                            response.totalMatches(), extra);
                });
            }

            System.out.println("PROBE advisor");
            ChatClient client = context.getBean(ChatClient.Builder.class).defaultSystem("You help customers.")
                    .defaultTools(new SupportTools()).build();
            for (String session : List.of("c-1", "c-1", "c-2")) {
                SCRIPT_CALLS.clear();
                String answer = client.prompt().user("Where is my order A-1042?")
                        .advisors(a -> a.param("chat_memory_conversation_id", session)).call().content();
                System.out.println("PROBE   session " + session + " answer " + answer);
                SCRIPT_CALLS.forEach(c -> System.out.println("PROBE     " + c));
            }
            try {
                client.prompt().user("Where is my order?").call().content();
                System.out.println("PROBE   no session id: no error");
            }
            catch (RuntimeException e) {
                System.out.println("PROBE   no session id: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        }
    }
}
