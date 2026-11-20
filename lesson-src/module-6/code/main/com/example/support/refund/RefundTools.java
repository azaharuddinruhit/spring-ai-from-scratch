package com.example.support.refund;

import static com.example.support.tools.CustomerToolContext.customerId;

import java.math.BigDecimal;

import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

@Component
public class RefundTools {

    private final RefundService refunds;

    public RefundTools(RefundService refunds) {
        this.refunds = refunds;
    }

    @Tool(description = """
            Refund a whole order. Look the order up first: the amount must be its total. The customer confirms the \
            refund in the app before it runs.""",
            requiresConfirmation = true)
    String refundOrder(@ToolParam(description = "The order number, such as 1042") String orderNumber,
                       @ToolParam(description = "The order total, the amount to refund") BigDecimal amount,
                       @ToolParam(description = "The customer's reason, in their words") String reason,
                       ToolContext context) {
        Refund refund = refunds.refund(customerId(context), orderNumber, amount, reason);
        return "Refunded " + refund.amount() + " for order " + refund.orderNumber() + ".";
    }
}
