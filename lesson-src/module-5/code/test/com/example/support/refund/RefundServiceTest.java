package com.example.support.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import com.example.support.order.Order;
import com.example.support.order.OrderRepository;
import com.example.support.order.OrderStatus;
import com.example.support.tools.ToolRefusalException;

import org.junit.jupiter.api.Test;

class RefundServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-18T10:00:00Z");
    private static final UUID REFUND_ID = UUID.fromString("7c9e6679-7425-40de-944b-e07fc1f90ae7");

    private final OrderRepository orders = mock(OrderRepository.class);
    private final RefundRepository refunds = mock(RefundRepository.class);
    private final PaymentClient payments = mock(PaymentClient.class);
    private final RefundService service = new RefundService(orders, refunds, payments, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void proposesTheOrderTotalWithoutPaying() {
        given(orders.findForCustomer("alice", "1042")).willReturn(Optional.of(order(OrderStatus.DELIVERED)));

        Refund refund = service.propose("alice", "1042", "Arrived broken");

        assertThat(refund.amount()).isEqualByComparingTo("59.90");
        assertThat(refund.status()).isEqualTo(RefundStatus.PENDING);
        assertThat(refund.expiresAt()).isEqualTo(NOW.plus(RefundService.CONFIRMATION_WINDOW));
        then(refunds).should().insert(refund);
        then(payments).shouldHaveNoInteractions();
    }

    @Test
    void refusesAnOrderThatCannotBeRefunded() {
        given(orders.findForCustomer("alice", "1042")).willReturn(Optional.of(order(OrderStatus.REFUNDED)));

        assertThatThrownBy(() -> service.propose("alice", "1042", "Again please"))
                .isInstanceOf(ToolRefusalException.class)
                .hasMessage("Order 1042 is REFUNDED and cannot be refunded.");
        then(refunds).shouldHaveNoInteractions();
    }

    @Test
    void paysWhenTheCustomerConfirms() {
        given(refunds.findForCustomer("alice", REFUND_ID)).willReturn(Optional.of(pending(NOW.plusSeconds(60))));
        given(refunds.markConfirmed(REFUND_ID)).willReturn(true);

        Refund refund = service.confirm("alice", REFUND_ID);

        assertThat(refund.status()).isEqualTo(RefundStatus.CONFIRMED);
        then(payments).should().refund("1042", new BigDecimal("59.90"), REFUND_ID);
    }

    @Test
    void doesNotPayAnExpiredProposal() {
        given(refunds.findForCustomer("alice", REFUND_ID)).willReturn(Optional.of(pending(NOW.minusSeconds(1))));

        assertThatThrownBy(() -> service.confirm("alice", REFUND_ID)).isInstanceOf(RefundNotConfirmableException.class);
        then(payments).shouldHaveNoInteractions();
    }

    @Test
    void paysOnceWhenTwoConfirmationsRace() {
        given(refunds.findForCustomer("alice", REFUND_ID)).willReturn(Optional.of(pending(NOW.plusSeconds(60))));
        given(refunds.markConfirmed(REFUND_ID)).willReturn(false);

        assertThatThrownBy(() -> service.confirm("alice", REFUND_ID)).isInstanceOf(RefundNotConfirmableException.class);
        then(payments).should(never()).refund(any(), any(), any());
    }

    @Test
    void hidesAnotherCustomersRefund() {
        given(refunds.findForCustomer("bob", REFUND_ID)).willReturn(Optional.empty());

        assertThatThrownBy(() -> service.confirm("bob", REFUND_ID)).isInstanceOf(RefundNotFoundException.class);
    }

    private static Order order(OrderStatus status) {
        return new Order("1042", status, new BigDecimal("59.90"), LocalDate.of(2026, 11, 2), "1Z999AA10123456784");
    }

    private static Refund pending(Instant expiresAt) {
        return new Refund(REFUND_ID, "alice", "1042", new BigDecimal("59.90"), "Arrived broken", RefundStatus.PENDING, expiresAt);
    }
}
