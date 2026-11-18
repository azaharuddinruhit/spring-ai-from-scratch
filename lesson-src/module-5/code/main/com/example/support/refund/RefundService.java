package com.example.support.refund;

import java.time.Clock;
import java.time.Duration;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.example.support.order.Order;
import com.example.support.order.OrderRepository;
import com.example.support.order.OrderStatus;
import com.example.support.tools.ToolRefusalException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The model can only propose a refund. Money moves when the customer confirms it, outside the model's loop. */
@Service
public class RefundService {

    static final Duration CONFIRMATION_WINDOW = Duration.ofMinutes(15);

    private static final Set<OrderStatus> REFUNDABLE = EnumSet.of(OrderStatus.SHIPPED, OrderStatus.DELIVERED);

    private final OrderRepository orders;
    private final RefundRepository refunds;
    private final PaymentClient payments;
    private final Clock clock;

    RefundService(OrderRepository orders, RefundRepository refunds, PaymentClient payments, Clock clock) {
        this.orders = orders;
        this.refunds = refunds;
        this.payments = payments;
        this.clock = clock;
    }

    @Transactional
    public Refund propose(String customerId, String orderNumber, String reason) {
        Order order = orders.findForCustomer(customerId, orderNumber)
                .orElseThrow(() -> new ToolRefusalException("This customer has no order " + orderNumber + "."));
        if (!REFUNDABLE.contains(order.status())) {
            throw new ToolRefusalException("Order " + orderNumber + " is " + order.status() + " and cannot be refunded.");
        }
        // The amount comes from the order, never from the model.
        Refund refund = new Refund(UUID.randomUUID(), customerId, orderNumber, order.total(), reason, RefundStatus.PENDING,
                clock.instant().plus(CONFIRMATION_WINDOW));
        refunds.insert(refund);
        return refund;
    }

    @Transactional(readOnly = true)
    public List<Refund> pending(String customerId) {
        return refunds.findPendingForCustomer(customerId);
    }

    @Transactional
    public Refund confirm(String customerId, UUID refundId) {
        Refund refund = refunds.findForCustomer(customerId, refundId).orElseThrow(() -> new RefundNotFoundException(refundId));
        if (clock.instant().isAfter(refund.expiresAt()) || !refunds.markConfirmed(refundId)) {
            throw new RefundNotConfirmableException(refundId);
        }
        payments.refund(refund.orderNumber(), refund.amount(), refund.id());
        return refund.confirmed();
    }
}
