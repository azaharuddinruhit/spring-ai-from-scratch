package com.example.support.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.times;

import java.math.BigDecimal;
import java.util.List;

import com.example.support.SupportIntegrationTest;
import com.example.support.tools.ToolRefusalException;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallConfirmationRequiredException;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.jdbc.Sql;

@SupportIntegrationTest
@Sql("/orders.sql")
class RefundIT {

    @Autowired
    private RefundService refunds;

    @Autowired
    private PaymentClient payments; // the mock from @SupportIntegrationTest

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private ToolCallingManager toolCallingManager;

    @Autowired
    private RefundTools refundTools;

    @Test
    void theAppsToolCallingManagerWaitsForAConfirmation() {
        var call = AssistantMessage.builder()
                .content("")
                .toolCalls(List.of(new AssistantMessage.ToolCall("call-1", "function", "refundOrder", """
                        {"orderNumber": "1042", "amount": 59.90, "reason": "Arrived broken"}""")))
                .build();
        var prompt = new Prompt(List.of(), ToolCallingChatOptions.builder().toolCallbacks(ToolCallbacks.from(refundTools)).build());

        // spring.ai.tools.confirmation.enabled=false would run the refund here.
        assertThatThrownBy(() -> toolCallingManager.executeToolCalls(prompt, new ChatResponse(List.of(new Generation(call)))))
                .isInstanceOf(ToolCallConfirmationRequiredException.class);
        then(payments).shouldHaveNoInteractions();
    }

    @Test
    void anOrderIsRefundedAndPaidOnce() {
        refunds.refund("alice", "1042", new BigDecimal("59.9"), "Arrived broken");

        assertThatThrownBy(() -> refunds.refund("alice", "1042", new BigDecimal("59.90"), "Arrived broken"))
                .isInstanceOf(ToolRefusalException.class)
                .hasMessage("Order 1042 has already been refunded.");
        then(payments).should(times(1)).refund(any(), any(), any());
        assertThat(jdbc.sql("SELECT amount FROM refunds WHERE order_number = '1042'").query(BigDecimal.class).single())
                .isEqualByComparingTo("59.90");
    }
}
