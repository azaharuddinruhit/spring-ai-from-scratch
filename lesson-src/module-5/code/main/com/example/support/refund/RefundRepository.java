package com.example.support.refund;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class RefundRepository {

    private final JdbcClient jdbc;

    RefundRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** False when the order already has a refund: the id is the primary key. */
    public boolean insertIfAbsent(Refund refund) {
        return jdbc.sql("""
                        INSERT INTO refunds (id, customer_id, order_number, amount, reason)
                        VALUES (:id, :customerId, :orderNumber, :amount, :reason)
                        ON CONFLICT (id) DO NOTHING""")
                .paramSource(refund)
                .update() == 1;
    }
}
