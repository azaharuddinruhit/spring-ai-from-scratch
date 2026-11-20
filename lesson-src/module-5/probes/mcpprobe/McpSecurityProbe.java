package mcpprobe;

import java.time.Instant;
import java.util.*;

import javax.crypto.spec.SecretKeySpec;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.customizer.McpSyncHttpClientRequestCustomizer;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.stereotype.Component;

public class McpSecurityProbe {

    static final byte[] SECRET = "0123456789abcdef0123456789abcdef".getBytes();
    static final List<String> LOG = Collections.synchronizedList(new ArrayList<>());

    @Configuration
    @EnableAutoConfiguration
    @EnableMethodSecurity
    @Import(SecuredTools.class)
    public static class ServerApp {
        @Bean
        SecurityFilterChain mcpSecurity(HttpSecurity http) throws Exception {
            return http.authorizeHttpRequests(a -> a.requestMatchers("/mcp").hasAuthority("SCOPE_mcp.tools").anyRequest().denyAll())
                    .oauth2ResourceServer(o -> o.jwt(j -> {}))
                    .csrf(c -> c.disable())
                    .build();
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return NimbusJwtDecoder.withSecretKey(new SecretKeySpec(SECRET, "HmacSHA256")).build();
        }
    }

    @Component
    public static class SecuredTools {
        @McpTool(description = "Look up the status of an order")
        public String orderStatus(@McpToolParam(description = "Order number") String orderNumber) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            LOG.add("orderStatus on " + Thread.currentThread().getName() + " auth=" + (auth == null ? null : auth.getName() + " " + auth.getAuthorities()));
            return "Order " + orderNumber + " has shipped";
        }

        @McpTool(name = "cancel-order", description = "Cancel an order")
        @PreAuthorize("hasAuthority('SCOPE_orders.write')")
        public String cancel(String orderNumber) {
            LOG.add("cancel ran for " + orderNumber);
            return "cancelled";
        }
    }

    static String token(String subject, String scope) throws Exception {
        var claims = new JWTClaimsSet.Builder().subject(subject).claim("scope", scope).expirationTime(Date.from(Instant.now().plusSeconds(600))).build();
        var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        jwt.sign(new MACSigner(SECRET));
        return jwt.serialize();
    }

    @Configuration
    @EnableAutoConfiguration
    public static class ClientApp {
        static String bearer;

        @Bean
        McpSyncHttpClientRequestCustomizer bearer() {
            return (builder, method, endpoint, body, context) -> {
                if (bearer != null) builder.header("Authorization", "Bearer " + bearer);
            };
        }
    }

    public static void main(String[] args) throws Exception {
        try {
            run();
        } catch (Throwable t) {
            System.out.println("FAILED " + t);
            for (Throwable c = t; c != null; c = c.getCause()) System.out.println("  cause " + c.getClass().getSimpleName() + ": " + String.valueOf(c.getMessage()).lines().findFirst().orElse(""));
        } finally {
            LOG.forEach(l -> System.out.println("SERVER " + l));
            System.exit(0);
        }
    }

    static String[] common(String... more) {
        List<String> a = new ArrayList<>(List.of("--spring.ai.openai.api-key=dummy", "--spring.ai.model.chat=none", "--spring.ai.model.embedding=none",
                "--spring.ai.vectorstore.type=none", "--spring.ai.session.repository.jdbc.initialize-schema=never", "--logging.level.root=ERROR"));
        a.addAll(List.of(more));
        return a.toArray(String[]::new);
    }

    static void run() throws Exception {
        ConfigurableApplicationContext server = new SpringApplicationBuilder(ServerApp.class).run(common("--server.port=18082",
                "--spring.ai.mcp.server.name=orders", "--spring.ai.mcp.server.protocol=STREAMABLE", "--spring.ai.mcp.client.enabled=false"));

        for (String scope : new String[] { "", "mcp.tools", "mcp.tools orders.write" }) {
            System.out.println("\n=== client token scope: '" + scope + "'");
            ClientApp.bearer = scope.isEmpty() ? null : token("agent-7", scope);
            ConfigurableApplicationContext client;
            try {
                client = new SpringApplicationBuilder(ClientApp.class).run(common("--spring.main.web-application-type=none", "--spring.ai.mcp.server.enabled=false",
                        "--spring.ai.mcp.client.streamable-http.connections.orders.url=http://localhost:18082"));
            } catch (Exception e) {
                Throwable root = e; while (root.getCause() != null) root = root.getCause();
                System.out.println("client startup failed: " + root.getClass().getSimpleName() + ": " + root.getMessage());
                continue;
            }
            List<ToolCallback> callbacks = new ArrayList<>();
            client.getBeansOfType(ToolCallbackProvider.class).values().forEach(p -> callbacks.addAll(List.of(p.getToolCallbacks())));
            System.out.println("tools: " + callbacks.stream().map(c -> c.getToolDefinition().name()).toList());
            for (ToolCallback cb : callbacks) {
                String args = "{\"orderNumber\":\"1042\"}";
                try {
                    System.out.println(cb.getToolDefinition().name() + " -> " + cb.call(args, new ToolContext(Map.of())));
                } catch (Exception e) {
                    System.out.println(cb.getToolDefinition().name() + " threw " + e.getClass().getSimpleName() + ": " + e.getMessage().replace('\n', ' '));
                }
            }
            client.close();
        }
        server.close();
    }
}
