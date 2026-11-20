package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.session.DefaultSessionService;
import org.springframework.ai.session.InMemorySessionRepository;
import org.springframework.ai.session.SessionService;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.core.Ordered;

class PiiRedactionAdvisorTest {

    private final List<Prompt> prompts = new ArrayList<>();
    private final SessionService sessionService = DefaultSessionService.builder()
            .sessionRepository(InMemorySessionRepository.builder().build())
            .build();

    private final ChatClient chatClient = ChatClient.builder(prompt -> {
                prompts.add(prompt);
                return new ChatResponse(List.of(new Generation(new AssistantMessage("Done."))));
            })
            .defaultAdvisors(new PiiRedactionAdvisor())
            .defaultAdvisors(SessionAdvisors.builder(sessionService)
                    .memory(memory -> memory.order(Ordered.HIGHEST_PRECEDENCE + 210))
                    .build())
            .build();

    @Test
    void theModelAndTheMemoryOnlySeeTheRedactedMessage() {
        chatClient.prompt()
                .user("Refund card 4111 1111 1111 1111 and mail ada@example.com")
                .advisors(SessionAdvisors.session("c-1"))
                .call()
                .content();

        String redacted = "Refund card [card] and mail [email]";
        assertThat(prompts.getLast().getUserMessage().getText()).isEqualTo(redacted);
        assertThat(sessionService.getMessages("c-1").getFirst().getText()).isEqualTo(redacted);
    }

    @Test
    void leavesOrderNumbersAndDatesAlone() {
        assertThat(PiiRedactionAdvisor.redact("Order 1042 from 2026-11-18")).isEqualTo("Order 1042 from 2026-11-18");
    }
}
