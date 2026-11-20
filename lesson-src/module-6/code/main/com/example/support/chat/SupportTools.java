package com.example.support.chat;

import java.util.stream.Stream;

import com.example.support.order.OrderTools;
import com.example.support.refund.RefundTools;

import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.ToolCallbackProvider;

/**
 * Every tool of the assistant: the chat client offers them, and a call the customer confirmed runs with them. Not a
 * ToolCallbackProvider bean, because an MCP server on the classpath would publish those as its own tools.
 */
record SupportTools(OrderTools orders, RefundTools refunds, ToolCallbackProvider shipping) {

    ToolCallback[] callbacks() {
        return Stream.concat(Stream.of(ToolCallbacks.from(orders, refunds)), Stream.of(shipping.getToolCallbacks()))
                .toArray(ToolCallback[]::new);
    }
}
