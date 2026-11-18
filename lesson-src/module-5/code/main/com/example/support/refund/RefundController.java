package com.example.support.refund;

import java.math.BigDecimal;
import java.security.Principal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/refunds")
class RefundController {

    private final RefundService refunds;

    RefundController(RefundService refunds) {
        this.refunds = refunds;
    }

    @GetMapping("/pending")
    List<RefundResponse> pending(Principal principal) {
        return refunds.pending(principal.getName()).stream().map(RefundResponse::from).toList();
    }

    @PostMapping("/{refundId}/confirmation")
    RefundResponse confirm(@PathVariable UUID refundId, Principal principal) {
        return RefundResponse.from(refunds.confirm(principal.getName(), refundId));
    }

    record RefundResponse(UUID id, String orderNumber, BigDecimal amount, RefundStatus status, Instant expiresAt) {

        static RefundResponse from(Refund refund) {
            return new RefundResponse(refund.id(), refund.orderNumber(), refund.amount(), refund.status(), refund.expiresAt());
        }
    }
}
