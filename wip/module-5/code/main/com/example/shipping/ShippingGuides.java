package com.example.shipping;

import io.modelcontextprotocol.spec.McpSchema.PromptMessage;
import io.modelcontextprotocol.spec.McpSchema.Role;
import io.modelcontextprotocol.spec.McpSchema.TextContent;

import org.springframework.ai.mcp.annotation.McpArg;
import org.springframework.ai.mcp.annotation.McpPrompt;
import org.springframework.ai.mcp.annotation.McpResource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;

/** Read-only context for the client: a document it can attach (resource) and a ready-made instruction (prompt). */
@Component
public class ShippingGuides {

    static final String DELIVERY_POLICY = """
            # Delivery policy
            A parcel is late one business day after its estimated delivery date.
            A parcel is lost when it has had no scan for 10 business days; the customer then gets a replacement.""";

    private final ShipmentRepository shipments;

    ShippingGuides(ShipmentRepository shipments) {
        this.shipments = shipments;
    }

    @McpResource(uri = "shipping://policies/delivery", name = "delivery-policy", mimeType = "text/markdown",
            description = "When a parcel counts as late or lost, and what the customer gets")
    public String deliveryPolicy() {
        return DELIVERY_POLICY;
    }

    @McpPrompt(name = "explain-delay", description = "Explain to a customer why their parcel is late")
    @PreAuthorize("hasAuthority('SCOPE_shipments.read')")
    public PromptMessage explainDelay(
            @McpArg(name = "trackingNumber", description = "The carrier tracking number", required = true) String trackingNumber) {
        Shipment shipment = shipments.findByTrackingNumber(trackingNumber)
                .orElseThrow(() -> new IllegalArgumentException("No shipment with tracking number " + trackingNumber));
        // A plain String would reach the client as an ASSISTANT message; an instruction belongs in a USER message.
        String instruction = """
                Explain to the customer, in three sentences, where parcel %s is and when it should arrive. \
                It is %s, last scanned at %s on %s, and expected on %s. Follow the delivery policy below.

                %s""".formatted(shipment.trackingNumber(), shipment.status(), shipment.lastScan(), shipment.lastScanAt(),
                shipment.estimatedDelivery(), DELIVERY_POLICY);
        return PromptMessage.builder(Role.USER, TextContent.builder(instruction).build()).build();
    }
}
