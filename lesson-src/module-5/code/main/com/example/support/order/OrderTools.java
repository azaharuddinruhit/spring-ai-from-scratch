package com.example.support.order;

import static com.example.support.tools.CustomerToolContext.customerId;

import java.util.List;

import com.example.support.tools.ToolRefusalException;

import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/** Order lookups for the assistant. The customer comes from the tool context, never from the model. */
@Component
public class OrderTools {

    private final OrderRepository orders;

    public OrderTools(OrderRepository orders) {
        this.orders = orders;
    }

    @Tool(description = "Find one of the signed-in customer's orders by its order number")
    Order findOrder(@ToolParam(description = "The order number, such as 1042") String orderNumber, ToolContext context) {
        return orders.findForCustomer(customerId(context), orderNumber)
                .orElseThrow(() -> new ToolRefusalException("This customer has no order " + orderNumber + "."));
    }

    @Tool(description = "List the signed-in customer's most recent orders, newest first")
    List<Order> recentOrders(@ToolParam(description = "How many orders to return, from 1 to 10") int count, ToolContext context) {
        return orders.findRecentForCustomer(customerId(context), Math.clamp(count, 1, 10));
    }
}
