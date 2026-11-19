package com.example.support.refund;

import java.math.BigDecimal;
import java.util.UUID;

/** The payment provider. The refund id doubles as the idempotency key, so a retried refund never pays twice. */
public interface PaymentClient {

    void refund(String orderNumber, BigDecimal amount, UUID idempotencyKey);
}
