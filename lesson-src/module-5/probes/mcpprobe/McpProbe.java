package mcpprobe;

import java.io.IOException;
import java.util.*;

import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.customizer.McpSyncHttpClientRequestCustomizer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.mcp.annotation.*;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

public class McpProbe {

    static final List<String> SERVER_LOG = Collections.synchronizedList(new ArrayList<>());

    @org.springframework.context.annotation.Configuration
    @org.springframework.boot.autoconfigure.EnableAutoConfiguration
    @org.springframework.context.annotation.Import(OrderTools.class)
    public static class ServerApp {
        @Bean
        org.springframework.security.web.SecurityFilterChain open(org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
            return http.authorizeHttpRequests(a -> a.anyRequest().permitAll()).csrf(c -> c.disable()).build();
        }

        @Bean
        OncePerRequestFilter headerLogger() {
            return new OncePerRequestFilter() {
                protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
                    SERVER_LOG.add("HTTP " + req.getMethod() + " " + req.getRequestURI() + " auth=" + req.getHeader("Authorization") + " session=" + req.getHeader("Mcp-Session-Id"));
                    chain.doFilter(req, res);
                }
            };
        }
    }

    @Component
    public static class OrderTools {
        @McpTool(description = "Look up the status of an order")
        public String orderStatus(@McpToolParam(description = "Order number, such as 1042") String orderNumber, McpMeta meta) {
            SERVER_LOG.add("orderStatus(" + orderNumber + ") meta=" + meta.meta());
            return "Order " + orderNumber + " has shipped";
        }

        @McpTool(name = "cancel-order", description = "Cancel an order", annotations = @McpTool.McpAnnotations(readOnlyHint = false))
        public String cancel(String orderNumber) {
            if (orderNumber.equals("0")) throw new IllegalArgumentException("Order 0 cannot be cancelled");
            return "cancelled";
        }

        @McpResource(uri = "policy://refunds", name = "refund-policy", description = "The refund policy")
        public String refundPolicy() {
            return "Refunds take 5 business days.";
        }

        @McpPrompt(name = "summarize-ticket", description = "Summarize a support ticket")
        public String summarize(@McpArg(name = "ticket", description = "The ticket text", required = true) String ticket) {
            return "Summarize this ticket in two sentences: " + ticket;
        }
    }

    @org.springframework.context.annotation.Configuration
    @org.springframework.boot.autoconfigure.EnableAutoConfiguration
    public static class ClientApp {
        @Bean
        McpSyncHttpClientRequestCustomizer bearer() {
            return (builder, method, endpoint, body, context) -> builder.header("Authorization", "Bearer internal-token");
        }
    }

    public static class ClientMarker {}

    public static void main(String[] args) throws Exception {
        try { run(args); } catch (Throwable t) { t.printStackTrace(System.out); } finally { SERVER_LOG.forEach(l -> System.out.println("SERVER " + l)); System.exit(0); }
    }

    static void run(String[] args) throws Exception {
        String[] common = {
                "--spring.ai.openai.api-key=dummy", "--spring.ai.model.chat=none", "--spring.ai.model.embedding=none", "--spring.ai.vectorstore.type=none",
                "--spring.ai.session.repository.jdbc.initialize-schema=never", "--logging.level.root=WARN",
        };
        List<String> serverArgs = new ArrayList<>(List.of(common));
        serverArgs.addAll(List.of("--server.port=18081", "--spring.ai.mcp.server.name=orders", "--spring.ai.mcp.server.protocol=STREAMABLE", "--spring.ai.mcp.client.enabled=false"));
        ConfigurableApplicationContext server = new SpringApplicationBuilder(ServerApp.class).run(serverArgs.toArray(String[]::new));

        System.out.println("SERVER BEANS: " + Arrays.stream(server.getBeanDefinitionNames()).filter(n -> n.toLowerCase().contains("mcp") || n.toLowerCase().contains("router")).toList());
        if (args.length > 0) return;
        List<String> clientArgs = new ArrayList<>(List.of(common));
        clientArgs.addAll(List.of("--spring.main.web-application-type=none", "--spring.ai.mcp.server.enabled=false",
                "--spring.ai.mcp.client.streamable-http.connections.orders.url=http://localhost:18081",
                "--spring.ai.mcp.client.streamable-http.connections.orders-eu.url=http://localhost:18081"));
        ConfigurableApplicationContext client = new SpringApplicationBuilder(ClientApp.class).run(clientArgs.toArray(String[]::new));

        System.out.println("MCP clients: " + client.getBeansOfType(McpSyncClient.class).keySet() + " / list beans: " + Arrays.toString(client.getBeanNamesForType(List.class)));
        var providers = client.getBeansOfType(ToolCallbackProvider.class);
        System.out.println("providers: " + providers.keySet());
        List<ToolCallback> callbacks = new ArrayList<>();
        providers.values().forEach(p -> callbacks.addAll(List.of(p.getToolCallbacks())));
        for (ToolCallback cb : callbacks) {
            System.out.println("tool " + cb.getToolDefinition().name() + " | " + cb.getToolDefinition().description() + " | " + cb.getToolDefinition().inputSchema().replaceAll("\\s+", " "));
        }
        ToolCallback status = callbacks.stream().filter(c -> c.getToolDefinition().name().equals("orderStatus")).findFirst().orElseThrow();
        System.out.println("call result: " + status.call("{\"orderNumber\":\"1042\"}", new ToolContext(Map.of("customerId", "cust-42", "tenantApiKey", "sk-tenant-secret"))));
        ToolCallback cancel = callbacks.stream().filter(c -> c.getToolDefinition().name().contains("cancel")).findFirst().orElseThrow();
        try {
            System.out.println("cancel 0: " + cancel.call("{\"orderNumber\":\"0\"}", new ToolContext(Map.of())));
        } catch (Exception e) {
            System.out.println("cancel 0 threw " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
        @SuppressWarnings("unchecked") McpSyncClient raw = ((List<McpSyncClient>) client.getBean("mcpSyncClients")).getFirst();
        System.out.println("server info: " + raw.getServerInfo() + " capabilities: " + raw.getServerCapabilities());
        System.out.println("resources: " + raw.listResources().resources());
        System.out.println("prompts: " + raw.listPrompts().prompts());
        System.out.println("read: " + raw.readResource(new io.modelcontextprotocol.spec.McpSchema.ReadResourceRequest("policy://refunds")).contents());
        System.out.println("tools raw: " + raw.listTools().tools());
        client.close();
        server.close();
    }
}
