package com.example.support.chat;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Who owns each conversation and when it was last used. Spring AI's memory table records neither. */
@Repository
class SupportChats {

    private final JdbcClient jdbc;

    SupportChats(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    void recordUse(String conversationId, String customerId, Instant usedAt) {
        jdbc.sql("""
                        INSERT INTO support_chats (conversation_id, customer_id, last_used)
                        VALUES (:conversationId, :customerId, :usedAt)
                        ON CONFLICT (conversation_id) DO UPDATE SET last_used = EXCLUDED.last_used""")
                .param("conversationId", conversationId)
                .param("customerId", customerId)
                .param("usedAt", usedAt.atOffset(ZoneOffset.UTC)) // the driver can't bind an Instant
                .update();
    }

    List<String> ofCustomer(String customerId) {
        return jdbc.sql("SELECT conversation_id FROM support_chats WHERE customer_id = :customerId")
                .param("customerId", customerId)
                .query(String.class)
                .list();
    }

    List<String> idleSince(Instant cutoff) {
        return jdbc.sql("SELECT conversation_id FROM support_chats WHERE last_used < :cutoff")
                .param("cutoff", cutoff.atOffset(ZoneOffset.UTC))
                .query(String.class)
                .list();
    }

    void delete(String conversationId) {
        jdbc.sql("DELETE FROM support_chats WHERE conversation_id = :conversationId")
                .param("conversationId", conversationId)
                .update();
    }
}
