package com.example.support.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.example.support.security.SecurityConfig;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

@WebMvcTest(RefundController.class)
@Import(SecurityConfig.class)
class RefundControllerTest {

    private static final UUID REFUND_ID = UUID.fromString("7c9e6679-7425-40de-944b-e07fc1f90ae7");

    @Autowired
    private MockMvcTester mvc;

    @MockitoBean
    private RefundService refunds;

    @Test
    void confirmsTheSignedInCustomersRefund() {
        given(refunds.confirm("alice", REFUND_ID)).willReturn(new Refund(REFUND_ID, "alice", "1042", new BigDecimal("59.90"),
                "Arrived broken", RefundStatus.CONFIRMED, Instant.parse("2026-11-18T10:15:00Z")));

        assertThat(mvc.post().uri("/api/refunds/{id}/confirmation", REFUND_ID).with(jwt().jwt(token -> token.subject("alice"))))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        {
                          "orderNumber": "1042",
                          "amount": 59.90,
                          "status": "CONFIRMED"
                        }
                        """);
    }

    @Test
    void reportsAnExpiredProposalAs409() {
        given(refunds.confirm("alice", REFUND_ID)).willThrow(new RefundNotConfirmableException(REFUND_ID));

        assertThat(mvc.post().uri("/api/refunds/{id}/confirmation", REFUND_ID).with(jwt().jwt(token -> token.subject("alice"))))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson().extractingPath("$.detail").isEqualTo("Refund " + REFUND_ID + " is already confirmed or has expired");
    }

    @Test
    void reportsSomeoneElsesRefundAs404() {
        given(refunds.confirm("bob", REFUND_ID)).willThrow(new RefundNotFoundException(REFUND_ID));

        assertThat(mvc.post().uri("/api/refunds/{id}/confirmation", REFUND_ID).with(jwt().jwt(token -> token.subject("bob"))))
                .hasStatus(HttpStatus.NOT_FOUND);
    }

    @Test
    void needsASignedInCustomer() {
        assertThat(mvc.post().uri("/api/refunds/{id}/confirmation", REFUND_ID)).hasStatus(HttpStatus.UNAUTHORIZED);
    }
}
