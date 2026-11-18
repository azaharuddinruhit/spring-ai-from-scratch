package com.example.shipping;

import java.time.Instant;
import java.time.LocalDate;

public record Shipment(String trackingNumber, String carrier, String status, String lastScan, Instant lastScanAt,
                       LocalDate estimatedDelivery) {
}
