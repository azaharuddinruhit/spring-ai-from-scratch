package com.example.support.refund;

import java.math.BigDecimal;
import java.util.UUID;

public record Refund(UUID id, String customerId, String orderNumber, BigDecimal amount, String reason) {
}
