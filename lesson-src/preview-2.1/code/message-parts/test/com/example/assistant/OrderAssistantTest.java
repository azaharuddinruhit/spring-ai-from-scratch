package com.example.assistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.part.ReasoningPart;
import org.springframework.ai.chat.messages.part.StreamingParts;
import org.springframework.ai.chat.messages.part.TextPart;
import org.springframework.ai.chat.messages.part.ToolCallPart;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import reactor.core.publisher.Flux;

/** The assistant over a scripted chat model that replies with parts: reasoning and a tool call, then reasoning and text. */
@SpringBootTest
class OrderAssistantTest {

    @Autowired
    OrderAssistant assistant;

    @BeforeEach
    void reset() {
        ScriptedChatModel.PROMPTS.clear();
    }

    @Test
    void theAnswerAndTheLastCallsReasoningComeBackApart() {
        Reply reply = assistant.reply("Where is my order A-1042?");

        assertThat(reply.answer()).isEqualTo("Your order A-1042 shipped with DHL.");
        assertThat(reply.reasoning()).isEqualTo("It shipped with DHL.");
    }

    @Test
    void theReasoningBeforeTheToolCallGoesBackToTheModelWithIt() {
        assistant.reply("Where is my order A-1042?");

        AssistantMessage toolCallTurn = (AssistantMessage) ScriptedChatModel.PROMPTS.get(1).getInstructions().get(2);
        assertThat(toolCallTurn.getReasoning()).extracting(ReasoningPart::text).containsExactly("Look the order up first.");
        assertThat(toolCallTurn.getToolCalls()).extracting(AssistantMessage.ToolCall::name).containsExactly("findOrder");
    }

    @Test
    void aStreamCarriesOnlyTheAnswerText() {
        List<String> chunks = assistant.streamReply("Is 391 prime?").collectList().block();

        assertThat(String.join("", chunks)).isEqualTo("No: 17 × 23.");
    }

    @Test
    void describeNamesEachPartType() {
        assertThat(OrderAssistant.describe(ReasoningPart.of("Look it up."))).isEqualTo("reasoning, 11 characters");
        assertThat(OrderAssistant.describe(ToolCallPart.of(findOrder()))).isEqualTo("tool call findOrder {\"orderId\":\"A-1042\"}");
        assertThat(OrderAssistant.describe(TextPart.of("Shipped."))).isEqualTo("text, 8 characters");
    }

    static AssistantMessage.ToolCall findOrder() {
        return new AssistantMessage.ToolCall("call-1", "function", "findOrder", "{\"orderId\":\"A-1042\"}");
    }

    @TestConfiguration
    static class ScriptedChatModel {

        static final List<Prompt> PROMPTS = new ArrayList<>();

        @Bean
        @Primary
        ChatModel scriptedChatModel() {
            return new ChatModel() {
                @Override
                public ChatOptions getOptions() {
                    return ToolCallingChatOptions.builder().build();
                }

                @Override
                public ChatResponse call(Prompt prompt) {
                    PROMPTS.add(prompt);
                    AssistantMessage reply = PROMPTS.size() == 1
                            ? AssistantMessage.builder()
                                    .parts(List.of(ReasoningPart.of("Look the order up first."), ToolCallPart.of(findOrder())))
                                    .build()
                            : AssistantMessage.builder()
                                    .parts(List.of(ReasoningPart.of("It shipped with DHL."),
                                            TextPart.of("\n\nYour order A-1042 shipped with DHL.")))
                                    .build();
                    return new ChatResponse(List.of(new Generation(reply)));
                }

                @Override
                public Flux<ChatResponse> stream(Prompt prompt) {
                    return Flux.just(
                            chunk(StreamingParts.partial(ReasoningPart.of("17 times 23"), 0)),
                            chunk(StreamingParts.partial(ReasoningPart.of(" is 391."), 0)),
                            chunk(StreamingParts.partial(TextPart.of("No: "), 1)),
                            chunk(StreamingParts.partial(TextPart.of("17 × 23."), 1)));
                }

                private static ChatResponse chunk(org.springframework.ai.chat.messages.part.MessagePart part) {
                    return new ChatResponse(List.of(new Generation(AssistantMessage.builder().parts(List.of(part)).build())));
                }
            };
        }
    }
}
