package com.example.support.mcp;

import org.springframework.ai.mcp.client.common.autoconfigure.properties.McpClientCommonProperties;
import org.springframework.ai.mcp.client.common.autoconfigure.properties.McpStreamableHttpClientProperties;
import org.springframework.ai.model.tool.autoconfigure.ToolCallingProperties;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;

public class YamlProbe {
    @Configuration @EnableAutoConfiguration @Import(McpClientConfig.class) static class App {}
    public static void main(String[] a) {
        try (var ctx = new SpringApplicationBuilder(App.class).run("--spring.config.location=file:yaml/support-application.yaml",
                "--spring.main.web-application-type=none", "--SHIPPING_MCP_CLIENT_SECRET=x", "--logging.level.root=WARN",
                "--spring.ai.mcp.server.enabled=false", "--spring.ai.openai.api-key=dummy", "--spring.ai.model.chat=none",
                "--spring.ai.model.embedding=none", "--spring.ai.vectorstore.type=none", "--spring.ai.session.repository.jdbc.initialize-schema=never")) {
            System.out.println("allowed=" + ctx.getBean(SupportMcpProperties.class).allowedTools());
            var common = ctx.getBean(McpClientCommonProperties.class);
            System.out.println("initialized=" + common.isInitialized() + " timeout=" + common.getRequestTimeout());
            System.out.println("connections=" + ctx.getBean(McpStreamableHttpClientProperties.class).getConnections());
            var reg = ctx.getBean(ClientRegistrationRepository.class).findByRegistrationId("shipping");
            System.out.println("registration=" + reg.getAuthorizationGrantType().getValue() + " " + reg.getScopes() + " " + reg.getProviderDetails().getTokenUri());
            var limits = ctx.getBean(ToolCallingProperties.class).getLimits();
            System.out.println("limits=" + limits.getMaxCallsPerToolDefault() + " " + limits.getMaxCallsPerTool() + " " + limits.getMaxTotalToolCalls());
        }
        System.exit(0);
    }
}
