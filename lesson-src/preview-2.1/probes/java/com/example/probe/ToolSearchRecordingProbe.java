package com.example.probe;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.example.support.tools.SupportTools;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.decision.DecisionModel;
import org.springframework.ai.decision.DecisionResponse;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.tool.toolsearch.ToolIndex;
import org.springframework.ai.tool.toolsearch.ToolReference;
import org.springframework.ai.tool.toolsearch.ToolSearchRequest;
import org.springframework.ai.tool.toolsearch.ToolSearchResponse;
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
 * Lesson 5.4 recording: six customer requests, each answered by the chat model on the OpenAI-compatible QWEN_* server through
 * the auto-configured ToolSearchToolCallingAdvisor with each of the four indexes, and once with all ten tools and no search.
 * Records every model call (tools sent, tool calls made, token usage), every search (query, results, and for the decision
 * index its two answers) and the final answer. Writes JSON to args[0].
 * Run with: --spring.ai.model.chat=openai --spring.ai.model.embedding=ollama --spring.ai.model.decision=ollama
 * --spring.ai.chat.client.tool-search-advisor.enabled=true --spring.ai.openai.base-url=$QWEN_BASE_URL ...
 */
@SpringBootApplication(scanBasePackages = "none")
public class ToolSearchRecordingProbe {

    static final List<String> REQUESTS = List.of(
            "Where is my order A-1042?",
            "The kettle from order A-1042 leaks. I want to send it back.",
            "I moved house. Can order A-1077 go to 12 Elm Road, Leeds instead?",
            "Is the PB-200 blender in stock?",
            "Please cancel order A-1077.",
            "What's the weather in Paris tomorrow?");

    static final String SYSTEM = "You are the support assistant of an online shop. Use the tools to look things up and to act. "
            + "Never invent order details. Answer in at most two sentences.";

    static final List<Map<String, Object>> CALLS = new ArrayList<>();
    static final List<Map<String, Object>> SEARCHES = new ArrayList<>();

    /** The index the advisor uses: switched per configuration, recording every search. */
    static final class SwitchingIndex implements ToolIndex {

        ToolIndex delegate;
        DecisionResponse lastDecision;

        @Override
        public void indexTool(String sessionId, ToolReference reference) {
            delegate.indexTool(sessionId, reference);
        }

        @Override
        public void indexTools(String sessionId, List<ToolReference> references) {
            delegate.indexTools(sessionId, references);
        }

        @Override
        public ToolSearchResponse search(ToolSearchRequest request) {
            lastDecision = null;
            long start = System.nanoTime();
            ToolSearchResponse response = delegate.search(request);
            Map<String, Object> search = new LinkedHashMap<>();
            search.put("query", request.query());
            search.put("maxResults", request.maxResults());
            search.put("categoryFilter", request.categoryFilter());
            search.put("millis", (System.nanoTime() - start) / 1_000_000);
            search.put("results", response.toolReferences().stream()
                    .map(r -> Map.of("tool", r.toolName(), "score", r.relevanceScore() == null ? -1 : r.relevanceScore())).toList());
            if (lastDecision != null) {
                var choice = lastDecision.getChoice("best_tool");
                search.put("anyToolApplies", lastDecision.getYesNo("any_tool_applies").getProbability());
                search.put("bestTool", choice.getProbabilities());
            }
            SEARCHES.add(search);
            return response;
        }

        @Override
        public void clearIndex(String sessionId) {
            delegate.clearIndex(sessionId);
        }
    }

    @Bean
    SwitchingIndex toolIndex() {
        return new SwitchingIndex();
    }

    /** Records every call the advisor makes to the chat model. */
    @Bean
    @Primary
    ChatModel recordingChatModel(OpenAiChatModel chatModel) {
        return new ChatModel() {
            @Override
            public ChatOptions getOptions() {
                return chatModel.getOptions();
            }

            @Override
            public ChatResponse call(Prompt prompt) {
                long start = System.nanoTime();
                ChatResponse response = chatModel.call(prompt);
                Map<String, Object> call = new LinkedHashMap<>();
                call.put("millis", (System.nanoTime() - start) / 1_000_000);
                call.put("toolsSent", ((ToolCallingChatOptions) prompt.getOptions()).getToolCallbacks().stream()
                        .map(c -> c.getToolDefinition().name()).toList());
                call.put("toolCalls", response.getResult().getOutput().getToolCalls().stream()
                        .map(t -> Map.of("name", t.name(), "arguments", t.arguments())).toList());
                call.put("text", response.getResult().getOutput().getText());
                var usage = response.getMetadata().getUsage();
                call.put("promptTokens", usage.getPromptTokens());
                call.put("completionTokens", usage.getCompletionTokens());
                CALLS.add(call);
                return response;
            }
        };
    }

    public static void main(String[] args) throws Exception {
        try (var context = new SpringApplicationBuilder(ToolSearchRecordingProbe.class).web(WebApplicationType.NONE).run(args)) {
            SwitchingIndex index = context.getBean(SwitchingIndex.class);
            DecisionModel decisionModel = context.getBean(DecisionModel.class);
            DecisionModel recordingDecisions = prompt -> {
                DecisionResponse response = decisionModel.call(prompt);
                index.lastDecision = response;
                return response;
            };
            Map<String, ToolIndex> indexes = new LinkedHashMap<>();
            indexes.put("regex", new RegexToolIndex());
            indexes.put("lucene", new LuceneToolIndex());
            indexes.put("vector", new VectorToolIndex(SimpleVectorStore.builder(context.getBean(EmbeddingModel.class)).build()));
            indexes.put("decision", DecisionToolIndex.builder(recordingDecisions).build());

            ChatClient searching = context.getBean(ChatClient.Builder.class).defaultSystem(SYSTEM)
                    .defaultTools(new SupportTools()).build();
            // Without tool search: every tool on every call, through the plain ToolCallingAdvisor.
            ChatClient allTools = ChatClient.builder(context.getBean(ChatModel.class))
                    .defaultSystem(SYSTEM).defaultTools(new SupportTools()).build();

            // Resumes a recording that was stopped: the runs already in the file are kept and skipped.
            JsonMapper json = JsonMapper.builder().build();
            Path out = Path.of(args[0]);
            List<Map<String, Object>> runs = new ArrayList<>();
            if (Files.exists(out)) {
                for (var node : json.readTree(Files.readString(out))) {
                    runs.add(json.convertValue(node, Map.class));
                }
            }
            for (String request : REQUESTS) {
                List<String> configurations = new ArrayList<>(indexes.keySet());
                configurations.add("none");
                // -Dprobe.configs=lucene records only those configurations (with the advisor's max-results, if set).
                String only = System.getProperty("probe.configs");
                if (only != null) {
                    configurations.retainAll(List.of(only.split(",")));
                }
                for (String configuration : configurations) {
                    if (runs.stream().anyMatch(r -> request.equals(r.get("request")) && configuration.equals(r.get("index")))) {
                        continue;
                    }
                    CALLS.clear();
                    SEARCHES.clear();
                    Map<String, Object> run = new LinkedHashMap<>();
                    run.put("request", request);
                    run.put("index", configuration);
                    long start = System.nanoTime();
                    try {
                        String answer;
                        if (configuration.equals("none")) {
                            answer = allTools.prompt().user(request).call().content();
                        }
                        else {
                            index.delegate = indexes.get(configuration);
                            answer = searching.prompt().user(request)
                                    .advisors(a -> a.param("chat_memory_conversation_id", UUID.randomUUID().toString()))
                                    .call().content();
                        }
                        run.put("answer", answer);
                    }
                    catch (RuntimeException e) {
                        run.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
                    }
                    run.put("millis", (System.nanoTime() - start) / 1_000_000);
                    run.put("calls", new ArrayList<>(CALLS));
                    run.put("searches", new ArrayList<>(SEARCHES));
                    runs.add(run);
                    System.out.printf("PROBE %-9s %5d ms %d calls %d searches: %s | %s%n", configuration, run.get("millis"),
                            CALLS.size(), SEARCHES.size(), request, String.valueOf(run.getOrDefault("answer", run.get("error"))).replace("\n", " "));
                    Files.writeString(out, json.writerWithDefaultPrettyPrinter().writeValueAsString(runs));
                }
            }
        }
    }
}
