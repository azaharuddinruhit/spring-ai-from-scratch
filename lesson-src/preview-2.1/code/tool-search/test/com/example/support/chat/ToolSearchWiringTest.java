package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
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

/**
 * The app's tool search wiring, with a scripted chat model in place of the real one: it searches, calls the tool it found, then
 * answers. The tool index is the Lucene one application.yaml configures, so this runs without any model server.
 */
@SpringBootTest
class ToolSearchWiringTest {

    @Autowired
    SupportChatService service;

    @Autowired
    ChatClient supportChatClient;

    @BeforeEach
    void reset() {
        ScriptedChatModel.TOOLS_SENT.clear();
        ScriptedChatModel.search = "{\"query\":\"cancel order\"}";
    }

    @Test
    void theFirstCallCarriesOnlyTheSearchToolAndTheNextOneTheThreeToolsItFound() {
        String answer = service.answer("c-1", "Please cancel order A-1077.");

        assertThat(answer).isEqualTo("Order A-1077 is cancelled.");
        assertThat(ScriptedChatModel.TOOLS_SENT.get(0)).containsExactly("toolSearchTool");
        assertThat(ScriptedChatModel.TOOLS_SENT.get(1)).contains("cancelOrder", "toolSearchTool").hasSize(4);
    }

    @Test
    void aSearchNeverReturnsMoreToolsThanMaxResultsNorFailsOnZero() {
        for (String search : List.of("{\"query\":\"order\",\"maxResults\":10}", "{\"query\":\"cancel order\",\"maxResults\":0}")) {
            ScriptedChatModel.TOOLS_SENT.clear();
            ScriptedChatModel.search = search;

            service.answer("c-2", "Please cancel order A-1077.");

            assertThat(ScriptedChatModel.TOOLS_SENT.get(1)).hasSize(4);
        }
    }

    @Test
    void aRequestWithoutASessionIdFails() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> supportChatClient.prompt().user("Please cancel order A-1077.").call().content())
                .withMessageContaining(SupportChatService.SESSION_ID);
    }

    @TestConfiguration
    static class ScriptedChatModel {

        static final List<List<String>> TOOLS_SENT = new ArrayList<>();
        static String search;

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
                    TOOLS_SENT.add(((ToolCallingChatOptions) prompt.getOptions()).getToolCallbacks().stream()
                            .map(c -> c.getToolDefinition().name()).toList());
                    AssistantMessage reply = switch (TOOLS_SENT.size()) {
                        case 1 -> toolCall("toolSearchTool", search);
                        case 2 -> toolCall("cancelOrder", "{\"orderId\":\"A-1077\"}");
                        default -> AssistantMessage.builder().content("Order A-1077 is cancelled.").build();
                    };
                    return new ChatResponse(List.of(new Generation(reply)));
                }
            };
        }

        private static AssistantMessage toolCall(String name, String arguments) {
            return AssistantMessage.builder()
                    .toolCalls(List.of(new AssistantMessage.ToolCall("call-" + name, "function", name, arguments)))
                    .build();
        }
    }
}
