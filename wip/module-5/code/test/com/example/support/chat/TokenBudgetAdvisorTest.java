package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

class TokenBudgetAdvisorTest {

    private Instant now = Instant.parse("2026-11-18T10:00:00Z");

    private final Clock clock = new Clock() {
        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    };

    private final ChatClient chatClient = ChatClient.builder(prompt -> new ChatResponse(
                    List.of(new Generation(new AssistantMessage("ok"))),
                    ChatResponseMetadata.builder().usage(new DefaultUsage(500, 100)).build()))
            .defaultAdvisors(new TokenBudgetAdvisor(1_000, clock))
            .build();

    private String ask(String userId) {
        return chatClient.prompt()
                .user("Hi")
                .advisors(advisor -> advisor.param(TokenBudgetAdvisor.USER_ID, userId))
                .call()
                .content();
    }

    @Test
    void refusesOnceTheDailyBudgetIsSpent() {
        ask("alice");
        ask("alice"); // 1,200 tokens: this call was allowed, the next one isn't

        assertThatThrownBy(() -> ask("alice")).isInstanceOf(TokenBudgetExceededException.class);
        assertThat(ask("bob")).isEqualTo("ok");
    }

    @Test
    void startsAgainTheNextDay() {
        ask("alice");
        ask("alice");
        now = now.plusSeconds(24 * 60 * 60);

        assertThat(ask("alice")).isEqualTo("ok");
    }
}
