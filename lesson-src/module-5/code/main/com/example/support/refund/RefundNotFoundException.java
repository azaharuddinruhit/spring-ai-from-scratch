package com.example.support.refund;

import java.util.UUID;

public class RefundNotFoundException extends RuntimeException {

    public RefundNotFoundException(UUID refundId) {
        super("No refund " + refundId);
    }
}
