package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;

class PiiRedactionAdvisorTest {

    private final List<Prompt> prompts = new ArrayList<>();
    private final ChatMemory chatMemory = MessageWindowChatMemory.builder().build();

    private final ChatClient chatClient = ChatClient.builder(prompt -> {
                prompts.add(prompt);
                return new ChatResponse(List.of(new Generation(new AssistantMessage("Done."))));
            })
            .defaultAdvisors(new PiiRedactionAdvisor(), MessageChatMemoryAdvisor.builder(chatMemory).build())
            .build();

    @Test
    void theModelAndTheMemoryOnlySeeTheRedactedMessage() {
        chatClient.prompt()
                .user("Refund card 4111 1111 1111 1111 and mail ada@example.com")
                .advisors(advisor -> advisor.param(ChatMemory.CONVERSATION_ID, "c-1"))
                .call()
                .content();

        String redacted = "Refund card [card] and mail [email]";
        assertThat(prompts.getLast().getUserMessage().getText()).isEqualTo(redacted);
        assertThat(chatMemory.get("c-1").getFirst().getText()).isEqualTo(redacted);
    }

    @Test
    void leavesOrderNumbersAndDatesAlone() {
        assertThat(PiiRedactionAdvisor.redact("Order 1042 from 2026-11-18")).isEqualTo("Order 1042 from 2026-11-18");
    }
}
