package com.example.probe;

import java.util.List;
import java.util.Map;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.DefaultToolCallingManager;
import org.springframework.ai.model.tool.ToolExecutionResult;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;

/**
 * Step 1 probe: the message parts OpenAiChatModel builds from an OpenAI-compatible reasoning server, across a tool call,
 * whether the reasoning is replayed on the next request (see the logging proxy's file), streaming, and thinking switched off
 * through extraBody.
 */
@SpringBootApplication
public class PartsFactsProbe {

    static class OrderTools {
        @Tool(description = "Look up an order by its id")
        String findOrder(String orderId) {
            return "{\"orderId\":\"" + orderId + "\",\"status\":\"SHIPPED\",\"carrier\":\"DHL\",\"eta\":\"2026-11-21\"}";
        }
    }

    public static void main(String[] args) {
        try (var context = new SpringApplicationBuilder(PartsFactsProbe.class).web(WebApplicationType.NONE).run(args)) {
            ChatModel chatModel = context.getBean(ChatModel.class);
            System.out.println("PROBE bean " + chatModel.getClass().getName());

            System.out.println("PROBE default model, no runtime options: "
                    + chatModel.call(new Prompt("Say OK.")).getMetadata().getModel());
            try {
                chatModel.call(new Prompt("Say OK.", OpenAiChatOptions.builder().temperature(0.2).build()));
                System.out.println("PROBE runtime options without a model: kept the configured model");
            } catch (RuntimeException e) {
                System.out.println("PROBE runtime options without a model: " + e.getMessage().replaceAll("model=[^ ]+", "model=<x>"));
            }
            String model = System.getenv("QWEN_MODEL");
            var options = OpenAiChatOptions.builder()
                    .model(model)
                    .toolCallbacks(ToolCallbacks.from(new OrderTools()))
                    .build();
            Prompt first = new Prompt(List.of(new UserMessage("Where is my order A-1042?")), options);
            ChatResponse r1 = chatModel.call(first);
            print("turn 1", r1);

            ToolExecutionResult executed = DefaultToolCallingManager.builder().build().executeToolCalls(first, r1);
            Prompt second = new Prompt(executed.conversationHistory(), options);
            ChatResponse r2 = chatModel.call(second);
            print("turn 2", r2);
            for (Message m : executed.conversationHistory()) {
                System.out.println("PROBE   history " + m.getMessageType() + " " + m.getClass().getSimpleName());
            }

            System.out.println("PROBE stream");
            List<ChatResponse> chunks = chatModel.stream(new Prompt("Is 391 prime? Answer in one sentence.")).collectList().block();
            long reasoningChunks = chunks.stream()
                    .filter(c -> c.getResult() != null && !c.getResult().getOutput().getReasoning().isEmpty())
                    .count();
            System.out.println("PROBE   chunks " + chunks.size() + ", with reasoning parts " + reasoningChunks);

            var noThinking = OpenAiChatOptions.builder()
                    .model(model)
                    .extraBody(Map.of("chat_template_kwargs", Map.of("enable_thinking", false)))
                    .build();
            print("thinking off (Java map)", chatModel.call(new Prompt("Is 391 prime? Answer in one sentence.", noThinking)));
        }
    }

    private static void print(String label, ChatResponse response) {
        AssistantMessage message = response.getResult().getOutput();
        System.out.println("PROBE " + label + " finish " + response.getResult().getMetadata().getFinishReason() + " usage "
                + response.getMetadata().getUsage());
        message.getParts().forEach(part -> System.out.println("PROBE   part " + part.getClass().getSimpleName() + " "
                + String.valueOf(part).replace('\n', ' ').substring(0, Math.min(220, String.valueOf(part).length()))));
        System.out.println("PROBE   getText [" + message.getText() + "] reasoning " + message.getReasoning().size()
                + " toolCalls " + message.getToolCalls().size());
    }
}
