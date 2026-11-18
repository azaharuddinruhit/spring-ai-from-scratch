package com.example.support.refund;

import static com.example.support.tools.CustomerToolContext.customerId;

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
            Propose a refund of a whole order. Nothing is refunded until the customer confirms it in the app \
            within 15 minutes, so tell them to look for the confirmation button.""")
    Refund proposeRefund(@ToolParam(description = "The order number, such as 1042") String orderNumber,
                         @ToolParam(description = "The customer's reason, in their words") String reason,
                         ToolContext context) {
        return refunds.propose(customerId(context), orderNumber, reason);
    }
}
