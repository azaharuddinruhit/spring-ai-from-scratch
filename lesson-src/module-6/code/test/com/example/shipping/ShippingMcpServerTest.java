package com.example.shipping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.spec.McpSchema.CallToolRequest;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;
import io.modelcontextprotocol.spec.McpSchema.GetPromptRequest;
import io.modelcontextprotocol.spec.McpSchema.GetPromptResult;
import io.modelcontextprotocol.spec.McpSchema.ReadResourceRequest;
import io.modelcontextprotocol.spec.McpSchema.Resource;
import io.modelcontextprotocol.spec.McpSchema.Role;
import io.modelcontextprotocol.spec.McpSchema.TextContent;
import io.modelcontextprotocol.spec.McpSchema.TextResourceContents;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.test.context.TestPropertySource; // probe-only
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "spring.autoconfigure.exclude=org.springframework.ai.model.session.jdbc.autoconfigure.JdbcSessionRepositoryAutoConfiguration") // probe-only: this classpath also holds the support app, its datasource and session store
class ShippingMcpServerTest {

    @LocalServerPort
    private int port;

    @MockitoBean
    private ShipmentRepository shipments;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void tracksAParcelForAClientWithTheReadScope() {
        given(shipments.findByTrackingNumber("1Z999AA10123456784")).willReturn(Optional.of(new Shipment("1Z999AA10123456784",
                "UPS", "IN_TRANSIT", "Leipzig hub", Instant.parse("2026-11-17T21:04:00Z"), LocalDate.of(2026, 11, 19))));

        try (McpSyncClient client = connect("token-with", "mcp shipments.read")) {
            CallToolResult result = client.callTool(trackShipment("1Z999AA10123456784"));

            assertThat(result.isError()).isFalse();
            assertThat(((TextContent) result.content().getFirst()).text()).contains("\"status\":\"IN_TRANSIT\"");
        }
    }

    @Test
    void servesTheDeliveryPolicyAsAResource() {
        try (McpSyncClient client = connect("token-with", "mcp shipments.read")) {
            assertThat(client.listResources().resources()).extracting(Resource::uri).containsExactly("shipping://policies/delivery");

            var policy = (TextResourceContents) client.readResource(ReadResourceRequest.builder("shipping://policies/delivery").build())
                    .contents().getFirst();
            assertThat(policy.mimeType()).isEqualTo("text/markdown");
            assertThat(policy.text()).startsWith("# Delivery policy");
        }
    }

    @Test
    void buildsTheDelayPromptFromTheShipment() {
        given(shipments.findByTrackingNumber("1Z999AA10123456784")).willReturn(Optional.of(new Shipment("1Z999AA10123456784",
                "UPS", "DELAYED", "Leipzig hub", Instant.parse("2026-11-17T21:04:00Z"), LocalDate.of(2026, 11, 19))));

        try (McpSyncClient client = connect("token-with", "mcp shipments.read")) {
            GetPromptResult prompt = client.getPrompt(GetPromptRequest.builder("explain-delay")
                    .arguments(Map.of("trackingNumber", "1Z999AA10123456784"))
                    .build());

            assertThat(prompt.messages()).singleElement().satisfies(message -> {
                assertThat(message.role()).isEqualTo(Role.USER);
                assertThat(((TextContent) message.content()).text()).contains("DELAYED", "Leipzig hub", "# Delivery policy");
            });
        }
    }

    @Test
    void refusesTheToolWithoutTheReadScope() {
        try (McpSyncClient client = connect("token-without", "mcp")) {
            CallToolResult result = client.callTool(trackShipment("1Z999AA10123456784"));

            assertThat(result.isError()).isTrue();
            assertThat(((TextContent) result.content().getFirst()).text()).contains("Access Denied");
        }
    }

    @Test
    void rejectsAnUnknownToken() {
        given(jwtDecoder.decode("forged")).willThrow(new JwtException("bad signature"));

        assertThatThrownBy(() -> connect("forged", null)).hasRootCauseMessage("Authorization error when sending message");
    }

    private McpSyncClient connect(String token, String scope) {
        if (scope != null) {
            given(jwtDecoder.decode(token)).willReturn(Jwt.withTokenValue(token)
                    .header("alg", "RS256").subject("support-assistant").claim("scope", scope).build());
        }
        var transport = HttpClientStreamableHttpTransport.builder("http://localhost:" + port)
                .addHttpRequestCustomizer((request, method, endpoint, body, context) -> request.header("Authorization", "Bearer " + token))
                .build();
        McpSyncClient client = McpClient.sync(transport).build();
        client.initialize();
        return client;
    }

    private static CallToolRequest trackShipment(String trackingNumber) {
        return CallToolRequest.builder("track_shipment").arguments(Map.of("trackingNumber", trackingNumber)).build();
    }
}
