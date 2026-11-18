package com.example.support.mcp;

import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;

import org.springframework.ai.mcp.McpToolFilter;
import org.springframework.ai.mcp.ToolContextToMcpMetaConverter;
import org.springframework.ai.mcp.customizer.McpClientCustomizer;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.client.AuthorizedClientServiceOAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.OAuth2AuthorizeRequest;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.util.Assert;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SupportMcpProperties.class)
class McpClientConfig {

    /** The default copies the whole ToolContext (our customer id included) into every MCP call's _meta. */
    @Bean
    ToolContextToMcpMetaConverter noToolContextForMcpServers() {
        return ToolContextToMcpMetaConverter.noOp();
    }

    @Bean
    McpToolFilter reviewedToolsOnly(SupportMcpProperties properties) {
        return (connection, tool) -> properties.allowedTools().contains(tool.name());
    }

    /** A connection named like an OAuth2 client registration gets that registration's token, and no other connection does. */
    @Bean
    McpClientCustomizer<HttpClientStreamableHttpTransport.Builder> accessTokenPerServer(
            ClientRegistrationRepository registrations, OAuth2AuthorizedClientManager authorizedClients) {
        return (connection, transport) -> {
            if (registrations.findByRegistrationId(connection) != null) {
                transport.addHttpRequestCustomizer((request, method, endpoint, body, context) ->
                        request.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken(authorizedClients, connection)));
            }
        };
    }

    /** Fetches client-credentials tokens outside a web request, and reuses each one until it expires. */
    @Bean
    OAuth2AuthorizedClientManager authorizedClientManager(ClientRegistrationRepository registrations,
                                                          OAuth2AuthorizedClientService authorizedClients) {
        return new AuthorizedClientServiceOAuth2AuthorizedClientManager(registrations, authorizedClients);
    }

    private static String accessToken(OAuth2AuthorizedClientManager authorizedClients, String registrationId) {
        OAuth2AuthorizedClient client = authorizedClients.authorize(
                OAuth2AuthorizeRequest.withClientRegistrationId(registrationId).principal("support-assistant").build());
        Assert.state(client != null, () -> "No access token for MCP server " + registrationId);
        return client.getAccessToken().getTokenValue();
    }
}
