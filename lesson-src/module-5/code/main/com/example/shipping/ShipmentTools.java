package com.example.shipping;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpTool.McpAnnotations;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;

@Component
public class ShipmentTools {

    private final ShipmentRepository shipments;

    ShipmentTools(ShipmentRepository shipments) {
        this.shipments = shipments;
    }

    @McpTool(name = "track_shipment", description = "Current status, last scan and estimated delivery of a parcel",
            annotations = @McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true, openWorldHint = false))
    @PreAuthorize("hasAuthority('SCOPE_shipments.read')")
    public Shipment trackShipment(
            @McpToolParam(description = "The carrier tracking number, such as 1Z999AA10123456784") String trackingNumber) {
        return shipments.findByTrackingNumber(trackingNumber)
                .orElseThrow(() -> new IllegalArgumentException("No shipment with tracking number " + trackingNumber));
    }
}
