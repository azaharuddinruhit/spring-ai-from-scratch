package com.example.support.tools;

import java.time.LocalDate;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

/**
 * Ten support tools. Their answers are fixed, so the lesson can show which tool the model found and called; Module 5 builds
 * real ones on a database. The descriptions are what every tool index searches, so each says what the tool does in a customer's
 * words.
 */
@Component
public class SupportTools {

    public record Order(String orderId, String status, String items, String carrier, LocalDate expectedDelivery) {}

    public record Stock(String productCode, int inStock, LocalDate nextDelivery) {}

    @Tool(description = "Look up an order: its status, items, carrier and expected delivery date.")
    public Order findOrder(@ToolParam(description = "Order id, such as A-1042") String orderId) {
        return new Order(orderId, "SHIPPED", "PB-200 blender", "DHL", LocalDate.of(2026, 11, 21));
    }

    @Tool(description = "Cancel an order that has not shipped yet.")
    public String cancelOrder(@ToolParam(description = "Order id") String orderId) {
        return "Order " + orderId + " is cancelled.";
    }

    @Tool(description = "Start a return for a delivered item and email the customer a return label.")
    public String startReturn(@ToolParam(description = "Order id") String orderId,
            @ToolParam(description = "Why the customer is returning it") String reason) {
        return "Return R-" + orderId.substring(2) + " started; the label is on its way.";
    }

    @Tool(description = "Refund an order to the original payment method.")
    public String refundOrder(@ToolParam(description = "Order id") String orderId) {
        return "Refund for " + orderId + " requested.";
    }

    @Tool(description = "Change the delivery address of an order that has not shipped yet.")
    public String updateDeliveryAddress(@ToolParam(description = "Order id") String orderId,
            @ToolParam(description = "The new address") String address) {
        return "Order " + orderId + " will go to " + address + ".";
    }

    @Tool(description = "Search the product catalogue by name or description.")
    public String searchProducts(@ToolParam(description = "Words to search for") String query) {
        return "PB-200 blender, KT-10 kettle";
    }

    @Tool(description = "Check whether a product is in stock, and when the next delivery arrives.")
    public Stock checkStock(@ToolParam(description = "Product code, such as PB-200") String productCode) {
        return new Stock(productCode, 0, LocalDate.of(2026, 11, 28));
    }

    @Tool(description = "Check whether an item is still under warranty.")
    public String warrantyStatus(@ToolParam(description = "Order id") String orderId) {
        return "Under warranty until 2028-03-02.";
    }

    @Tool(description = "Apply a discount voucher code to an order.")
    public String applyVoucher(@ToolParam(description = "Order id") String orderId,
            @ToolParam(description = "Voucher code") String code) {
        return "Voucher " + code + " is not valid for " + orderId + ".";
    }

    @Tool(description = "Open a ticket for a person on the support team to follow up.")
    public String openTicket(@ToolParam(description = "What the customer needs") String summary) {
        return "Ticket T-5521 opened.";
    }
}
