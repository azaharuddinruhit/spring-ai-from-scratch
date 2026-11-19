package com.example.shipping;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ShipmentRepository {

    private final JdbcClient jdbc;

    ShipmentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Shipment> findByTrackingNumber(String trackingNumber) {
        return jdbc.sql("""
                        SELECT tracking_number, carrier, status, last_scan, last_scan_at, estimated_delivery
                        FROM shipments WHERE tracking_number = :trackingNumber""")
                .param("trackingNumber", trackingNumber)
                .query(Shipment.class)
                .optional();
    }
}
