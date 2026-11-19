package com.example.support.tools;

import java.util.Map;

import org.springframework.ai.chat.model.ToolContext;

/** The signed-in customer, handed to tools by the application. The model never sees or sets it. */
public final class CustomerToolContext {

    private static final String CUSTOMER_ID = "customerId";

    private CustomerToolContext() {
    }

    public static Map<String, Object> of(String customerId) {
        return Map.of(CUSTOMER_ID, customerId);
    }

    public static String customerId(ToolContext context) {
        if (context.getContext().get(CUSTOMER_ID) instanceof String customerId) {
            return customerId;
        }
        throw new IllegalStateException("No customer in the tool context");
    }
}
