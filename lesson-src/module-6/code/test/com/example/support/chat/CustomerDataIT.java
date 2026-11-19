package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import com.example.support.SupportIntegrationTest;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.jdbc.Sql;

@SupportIntegrationTest
@Sql("/orders.sql")
class CustomerDataIT {

    @Autowired
    private SupportChatService chatService;

    @Autowired
    private SupportChats chats;

    @Autowired
    private ChatMemory chatMemory;

    @Test
    void forgettingACustomerDeletesEveryStoredMessage() {
        store("c-alice-1", "alice", Instant.now());
        store("c-alice-2", "alice", Instant.now());
        store("c-bob-1", "bob", Instant.now());

        assertThat(chatService.forgetCustomer("alice")).isEqualTo(2);

        assertThat(chatMemory.get("c-alice-1")).isEmpty();
        assertThat(chatMemory.get("c-alice-2")).isEmpty();
        assertThat(chatMemory.get("c-bob-1")).hasSize(1);
        assertThat(chats.ofCustomer("alice")).isEmpty();
    }

    @Test
    void deletesConversationsUnusedForTheRetentionPeriod() {
        store("c-old", "alice", Instant.now().minus(Duration.ofDays(31)));
        store("c-recent", "alice", Instant.now().minus(Duration.ofDays(1)));

        assertThat(chatService.forgetIdleChats(Duration.ofDays(30))).isEqualTo(1);

        assertThat(chatMemory.get("c-old")).isEmpty();
        assertThat(chatMemory.get("c-recent")).hasSize(1);
    }

    private void store(String conversationId, String customerId, Instant lastUsed) {
        chats.recordUse(conversationId, customerId, lastUsed);
        chatMemory.add(conversationId, new UserMessage("Where is my order?"));
    }
}
