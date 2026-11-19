package com.example.probe;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.example.assistant.AssistantApplication;
import com.example.assistant.OrderAssistant;
import com.example.assistant.Reply;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AbstractMessage;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.part.MessagePart;
import org.springframework.ai.chat.messages.part.ReasoningPart;
import org.springframework.ai.chat.messages.part.StreamingParts;
import org.springframework.ai.chat.messages.part.TextPart;
import org.springframework.ai.chat.messages.part.ToolCallPart;
import org.springframework.ai.chat.messages.part.ToolResultPart;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import reactor.core.publisher.Flux;

/**
 * Lesson 1.5 recordings: the lesson app (com.example.assistant) through the logging proxy, with a recording ChatModel around
 * OpenAiChatModel, so each step keeps every model call's request messages and reply parts, plus the proxy's line range (the
 * wire JSON). Writes -Dprobe.out (JSON). Run with the app's settings pointing at the proxy:
 * --spring.ai.openai.base-url=http://127.0.0.1:4555/v1 --spring.ai.openai.api-key=$QWEN_API_KEY
 * --spring.ai.openai.chat.model=$QWEN_MODEL, and -Dprobe.log=<the proxy's log file>.
 */
public class PartsRecordingProbe {

    static final List<Map<String, Object>> CALLS = new ArrayList<>();

    @Configuration
    static class Recording {
        @Bean
        @Primary
        ChatModel recordingChatModel(OpenAiChatModel delegate) {
            return new ChatModel() {
                @Override
                public ChatOptions getOptions() {
                    return delegate.getOptions();
                }

                @Override
                public ChatResponse call(Prompt prompt) {
                    long start = System.currentTimeMillis();
                    ChatResponse response = delegate.call(prompt);
                    record(prompt, response.getResult().getOutput(), response, System.currentTimeMillis() - start, null);
                    return response;
                }

                @Override
                public Flux<ChatResponse> stream(Prompt prompt) {
                    long start = System.currentTimeMillis();
                    List<ChatResponse> chunks = new ArrayList<>();
                    return delegate.stream(prompt).doOnNext(chunks::add).doOnComplete(() -> {
                        List<Map<String, Object>> perChunk = new ArrayList<>();
                        for (ChatResponse c : chunks) {
                            if (c.getResult() == null) {
                                perChunk.add(Map.of("parts", List.of()));
                                continue;
                            }
                            AssistantMessage m = c.getResult().getOutput();
                            perChunk.add(Map.of("parts", m.getParts().stream().map(PartsRecordingProbe::part).toList(),
                                    "text", String.valueOf(m.getText())));
                        }
                        ChatResponse last = chunks.getLast();
                        record(prompt, null, last, System.currentTimeMillis() - start, perChunk);
                    });
                }
            };
        }
    }

    static void record(Prompt prompt, AssistantMessage output, ChatResponse response, long millis, List<Map<String, Object>> chunks) {
        Map<String, Object> call = new LinkedHashMap<>();
        call.put("request", prompt.getInstructions().stream().map(PartsRecordingProbe::message).toList());
        if (output != null) {
            call.put("reply", output.getParts().stream().map(PartsRecordingProbe::part).toList());
            call.put("getText", output.getText());
        }
        if (chunks != null) {
            call.put("chunks", chunks);
        }
        var usage = response.getMetadata().getUsage();
        call.put("promptTokens", usage.getPromptTokens());
        call.put("completionTokens", usage.getCompletionTokens());
        call.put("finishReason", response.getResult() == null ? null : response.getResult().getMetadata().getFinishReason());
        call.put("millis", millis);
        CALLS.add(call);
    }

    static Map<String, Object> message(Message m) {
        List<MessagePart> parts = m instanceof AbstractMessage a ? a.getParts() : List.of();
        return Map.of("type", m.getMessageType().name(), "parts", parts.stream().map(PartsRecordingProbe::part).toList());
    }

    static Map<String, Object> part(MessagePart p) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("class", p.getClass().getSimpleName());
        switch (p) {
            case TextPart t -> out.put("text", t.text());
            case ReasoningPart r -> {
                out.put("text", r.text());
                out.put("summary", r.summary());
                out.put("payload", String.valueOf(r.payload()));
            }
            case ToolCallPart c -> {
                out.put("name", c.toolCall().name());
                out.put("arguments", c.toolCall().arguments());
                out.put("id", c.toolCall().id());
            }
            case ToolResultPart r -> {
                out.put("name", r.name());
                out.put("id", r.id());
                out.put("content", r.content().stream().map(PartsRecordingProbe::part).toList());
            }
            default -> out.put("toString", String.valueOf(p));
        }
        if (!p.attributes().isEmpty()) {
            out.put("attributes", p.attributes());
        }
        if (StreamingParts.partIndex(p) != null) {
            out.put("partial", StreamingParts.isPartial(p));
        }
        return out;
    }

    static int logLines() throws Exception {
        Path log = Path.of(System.getProperty("probe.log"));
        return Files.exists(log) ? Files.readAllLines(log).size() : 0;
    }

    static Map<String, Object> step(String label, ThrowingSupplier<Object> run) throws Exception {
        CALLS.clear();
        int from = logLines();
        long start = System.currentTimeMillis();
        Object result;
        try {
            result = run.get();
        } catch (RuntimeException e) {
            result = Map.of("error", e.getClass().getName() + ": " + e.getMessage());
        }
        Map<String, Object> step = new LinkedHashMap<>();
        step.put("label", label);
        step.put("result", result);
        step.put("millis", System.currentTimeMillis() - start);
        step.put("calls", new ArrayList<>(CALLS));
        step.put("wire", List.of(from, logLines()));
        System.out.println("PROBE " + label + " calls " + CALLS.size() + " result " + String.valueOf(result).replace('\n', ' ')
                .substring(0, Math.min(200, String.valueOf(result).length())));
        return step;
    }

    interface ThrowingSupplier<T> {
        T get() throws Exception;
    }

    public static void main(String[] args) throws Exception {
        String question = "Where is my order A-1042?";
        List<Map<String, Object>> steps = new ArrayList<>();
        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(AssistantApplication.class, Recording.class)
                .web(WebApplicationType.NONE).run(args)) {
            OrderAssistant assistant = context.getBean(OrderAssistant.class);
            ChatClient client = context.getBean("assistantChatClient", ChatClient.class);
            steps.add(step("reply", () -> reply(assistant.reply(question))));
            steps.add(step("no-replay", () -> client.prompt().user(question)
                    .options(OpenAiChatOptions.builder().replayReasoningContent(false)).call().content()));
            steps.add(step("quick-reply", () -> assistant.quickReply(question)));
            steps.add(step("stream", () -> String.join("", assistant.streamReply(question).collectList().block())));
            steps.add(step("no-tool", () -> reply(assistant.reply("Is 391 a prime number?"))));
        }
        String[] yamlArgs = java.util.stream.Stream.concat(java.util.Arrays.stream(args),
                java.util.stream.Stream.of("--spring.ai.openai.chat.extra-body.chat_template_kwargs.enable_thinking=false"))
                .toArray(String[]::new);
        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(AssistantApplication.class, Recording.class)
                .web(WebApplicationType.NONE).run(yamlArgs)) {
            OrderAssistant assistant = context.getBean(OrderAssistant.class);
            steps.add(step("property-extra-body", () -> reply(assistant.reply(question))));
        }
        Files.writeString(Path.of(System.getProperty("probe.out")),
                JsonMapper.builder().enable(SerializationFeature.INDENT_OUTPUT).build().writeValueAsString(steps));
    }

    static Map<String, Object> reply(Reply reply) {
        return Map.of("answer", reply.answer(), "reasoning", reply.reasoning());
    }
}
