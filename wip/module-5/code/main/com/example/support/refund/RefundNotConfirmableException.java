package com.example.support.refund;

import java.util.UUID;

public class RefundNotConfirmableException extends RuntimeException {

    public RefundNotConfirmableException(UUID refundId) {
        super("Refund " + refundId + " is already confirmed or has expired");
    }
}
