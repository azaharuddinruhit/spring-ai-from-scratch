package com.example.support.refund;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record Refund(UUID id, String customerId, String orderNumber, BigDecimal amount, String reason, RefundStatus status,
                     Instant expiresAt) {

    Refund confirmed() {
        return new Refund(id, customerId, orderNumber, amount, reason, RefundStatus.CONFIRMED, expiresAt);
    }
}
