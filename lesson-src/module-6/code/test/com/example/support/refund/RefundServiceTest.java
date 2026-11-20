package com.example.support.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import com.example.support.order.Order;
import com.example.support.order.OrderRepository;
import com.example.support.order.OrderStatus;
import com.example.support.tools.ToolRefusalException;

import org.junit.jupiter.api.Test;

class RefundServiceTest {

    private static final BigDecimal TOTAL = new BigDecimal("59.90");

    private final OrderRepository orders = mock(OrderRepository.class);
    private final RefundRepository refunds = mock(RefundRepository.class);
    private final PaymentClient payments = mock(PaymentClient.class);
    private final RefundService service = new RefundService(orders, refunds, payments);

    @Test
    void paysTheOrderTotalWithTheOrdersIdempotencyKey() {
        given(orders.findForCustomer("alice", "1042")).willReturn(Optional.of(order(OrderStatus.DELIVERED)));
        given(refunds.insertIfAbsent(any())).willReturn(true);

        Refund refund = service.refund("alice", "1042", TOTAL, "Arrived broken");

        assertThat(refund.id()).isEqualTo(RefundService.refundId("1042"));
        then(payments).should().refund("1042", TOTAL, RefundService.refundId("1042"));
    }

    @Test
    void refusesAnAmountThatIsNotTheOrderTotal() {
        given(orders.findForCustomer("alice", "1042")).willReturn(Optional.of(order(OrderStatus.DELIVERED)));

        assertThatThrownBy(() -> service.refund("alice", "1042", new BigDecimal("599.00"), "Arrived broken"))
                .isInstanceOf(ToolRefusalException.class)
                .hasMessage("Order 1042 can only be refunded in full, 59.90.");
        then(refunds).shouldHaveNoInteractions();
        then(payments).shouldHaveNoInteractions();
    }

    @Test
    void refusesAnOrderThatCannotBeRefunded() {
        given(orders.findForCustomer("alice", "1042")).willReturn(Optional.of(order(OrderStatus.REFUNDED)));

        assertThatThrownBy(() -> service.refund("alice", "1042", TOTAL, "Again please"))
                .isInstanceOf(ToolRefusalException.class)
                .hasMessage("Order 1042 is REFUNDED and cannot be refunded.");
        then(payments).shouldHaveNoInteractions();
    }

    @Test
    void paysOnceWhenTheOrderIsRefundedTwice() {
        given(orders.findForCustomer("alice", "1042")).willReturn(Optional.of(order(OrderStatus.DELIVERED)));
        given(refunds.insertIfAbsent(any())).willReturn(false);

        assertThatThrownBy(() -> service.refund("alice", "1042", TOTAL, "Arrived broken"))
                .isInstanceOf(ToolRefusalException.class)
                .hasMessage("Order 1042 has already been refunded.");
        then(payments).shouldHaveNoInteractions();
    }

    @Test
    void refusesAnotherCustomersOrder() {
        given(orders.findForCustomer("bob", "1042")).willReturn(Optional.empty());

        assertThatThrownBy(() -> service.refund("bob", "1042", TOTAL, "Arrived broken"))
                .isInstanceOf(ToolRefusalException.class)
                .hasMessage("This customer has no order 1042.");
        then(payments).shouldHaveNoInteractions();
    }

    private static Order order(OrderStatus status) {
        return new Order("1042", status, TOTAL, LocalDate.of(2026, 11, 2), "1Z999AA10123456784");
    }
}
