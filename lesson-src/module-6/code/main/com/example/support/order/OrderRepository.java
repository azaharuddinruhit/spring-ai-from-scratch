package com.example.support.order;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class OrderRepository {

    private final JdbcClient jdbc;

    OrderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Order> findForCustomer(String customerId, String orderNumber) {
        return jdbc.sql("""
                        SELECT number, status, total, placed_on, tracking_number FROM orders
                        WHERE customer_id = :customerId AND number = :number""")
                .param("customerId", customerId)
                .param("number", orderNumber)
                .query(Order.class)
                .optional();
    }

    public List<Order> findRecentForCustomer(String customerId, int limit) {
        return jdbc.sql("""
                        SELECT number, status, total, placed_on, tracking_number FROM orders
                        WHERE customer_id = :customerId ORDER BY placed_on DESC LIMIT :limit""")
                .param("customerId", customerId)
                .param("limit", limit)
                .query(Order.class)
                .list();
    }
}
