package com.example.support.refund;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class RefundRepository {

    private final JdbcClient jdbc;

    RefundRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(Refund refund) {
        jdbc.sql("""
                        INSERT INTO refunds (id, customer_id, order_number, amount, reason, status, expires_at)
                        VALUES (:id, :customerId, :orderNumber, :amount, :reason, :status, :expiresAt)""")
                .paramSource(refund)
                .update();
    }

    public Optional<Refund> findForCustomer(String customerId, UUID id) {
        return jdbc.sql("SELECT * FROM refunds WHERE customer_id = :customerId AND id = :id")
                .param("customerId", customerId)
                .param("id", id)
                .query(Refund.class)
                .optional();
    }

    public List<Refund> findPendingForCustomer(String customerId) {
        return jdbc.sql("SELECT * FROM refunds WHERE customer_id = :customerId AND status = 'PENDING' ORDER BY expires_at")
                .param("customerId", customerId)
                .query(Refund.class)
                .list();
    }

    /** Moves a refund from PENDING to CONFIRMED. False when another request confirmed it first. */
    public boolean markConfirmed(UUID id) {
        return jdbc.sql("UPDATE refunds SET status = 'CONFIRMED' WHERE id = :id AND status = 'PENDING'")
                .param("id", id)
                .update() == 1;
    }
}
