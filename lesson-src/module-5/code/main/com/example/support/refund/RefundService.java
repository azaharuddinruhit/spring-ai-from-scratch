package com.example.support.refund;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

import com.example.support.order.Order;
import com.example.support.order.OrderRepository;
import com.example.support.order.OrderStatus;
import com.example.support.tools.ToolRefusalException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Runs only after the customer confirmed the call, and checks it again: the model chose the arguments. */
@Service
public class RefundService {

    private static final Set<OrderStatus> REFUNDABLE = EnumSet.of(OrderStatus.SHIPPED, OrderStatus.DELIVERED);

    private final OrderRepository orders;
    private final RefundRepository refunds;
    private final PaymentClient payments;

    RefundService(OrderRepository orders, RefundRepository refunds, PaymentClient payments) {
        this.orders = orders;
        this.refunds = refunds;
        this.payments = payments;
    }

    @Transactional
    public Refund refund(String customerId, String orderNumber, BigDecimal amount, String reason) {
        Order order = orders.findForCustomer(customerId, orderNumber)
                .orElseThrow(() -> new ToolRefusalException("This customer has no order " + orderNumber + "."));
        if (!REFUNDABLE.contains(order.status())) {
            throw new ToolRefusalException("Order " + orderNumber + " is " + order.status() + " and cannot be refunded.");
        }
        // The customer confirmed this amount, so it must be the order total, not a number the model made up.
        if (amount.compareTo(order.total()) != 0) {
            throw new ToolRefusalException("Order " + orderNumber + " can only be refunded in full, " + order.total() + ".");
        }
        Refund refund = new Refund(refundId(orderNumber), customerId, orderNumber, order.total(), reason);
        if (!refunds.insertIfAbsent(refund)) {
            throw new ToolRefusalException("Order " + orderNumber + " has already been refunded.");
        }
        payments.refund(orderNumber, refund.amount(), refund.id());
        return refund;
    }

    /** One id per order, so a second refund of the order fails to insert and the provider sees the same key. */
    static UUID refundId(String orderNumber) {
        return UUID.nameUUIDFromBytes(("refund:" + orderNumber).getBytes(StandardCharsets.UTF_8));
    }
}
