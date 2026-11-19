package com.example.assistant;

import java.time.LocalDate;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/** One tool with fixed data, so a recorded reply shows exactly what the model was given. */
@Component
public class OrderTools {

    public record Order(String orderId, String status, String carrier, LocalDate expectedDelivery) {
    }

    @Tool(description = "Look up an order: its status, carrier and expected delivery date.")
    public Order findOrder(@ToolParam(description = "The order id, for example A-1042") String orderId) {
        return new Order(orderId, "SHIPPED", "DHL", LocalDate.parse("2026-11-21"));
    }
}
