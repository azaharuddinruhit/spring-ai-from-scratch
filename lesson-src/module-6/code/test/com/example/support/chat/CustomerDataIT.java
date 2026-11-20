package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import com.example.support.SupportIntegrationTest;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.session.CreateSessionRequest;
import org.springframework.ai.session.SessionAttributes;
import org.springframework.ai.session.SessionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.jdbc.Sql;

@SupportIntegrationTest
@Sql("/orders.sql")
class CustomerDataIT {

    @Autowired
    private SupportChatService chatService;

    @Autowired
    private SessionService sessionService;

    @Autowired
    private JdbcClient jdbc;

    @Test
    void forgettingACustomerDeletesEveryStoredMessage() {
        store("c-alice-1", "alice", Duration.ofDays(30));
        store("c-alice-2", "alice", Duration.ofDays(30));
        store("c-bob-1", "bob", Duration.ofDays(30));

        assertThat(chatService.forgetCustomer("alice")).isEqualTo(2);

        assertThat(sessionService.findById("c-alice-1")).isNull();
        assertThat(sessionService.findById("c-alice-2")).isNull();
        assertThat(sessionService.getMessages("c-bob-1")).hasSize(1);
        assertThat(jdbc.sql("SELECT count(*) FROM ai_session_event WHERE session_id LIKE 'c-alice-%'").query(Long.class).single())
                .isZero();
    }

    @Test
    void deletesSessionsPastTheirTimeToLive() {
        store("c-old", "alice", Duration.ofNanos(1));
        store("c-recent", "alice", Duration.ofDays(30));

        assertThat(chatService.forgetExpiredChats()).isEqualTo(1);

        assertThat(sessionService.findById("c-old")).isNull();
        assertThat(sessionService.getMessages("c-recent")).hasSize(1);
    }

    private void store(String sessionId, String customerId, Duration timeToLive) {
        sessionService.create(CreateSessionRequest.builder()
                .id(sessionId)
                .timeToLive(timeToLive)
                .metadata(SessionAttributes.PRINCIPAL_NAME, customerId)
                .build());
        sessionService.appendMessage(sessionId, new UserMessage("Where is my order?"));
    }
}
