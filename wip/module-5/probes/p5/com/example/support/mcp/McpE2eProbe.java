package com.example.support.mcp;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.mcp.SyncMcpToolCallbackProvider;
import org.springframework.ai.mcp.annotation.McpMeta;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.simple.JdbcClient;

public class McpE2eProbe {
    static final List<String> LOG = Collections.synchronizedList(new ArrayList<>());
    static final AtomicInteger TOKENS = new AtomicInteger();

    @Configuration
    static class HeaderLog {
        @Bean Filter headerLogFilter() {
            return (req, res, chain) -> {
                var r = (HttpServletRequest) req;
                String auth = r.getHeader("Authorization");
                String body = new String(r.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                LOG.add(r.getMethod() + " auth=" + (auth == null ? null : auth.substring(0, Math.min(20, auth.length())) + "...") + " body=" + abbreviate(body.replaceAll("\s+", "")));
                chain.doFilter(new jakarta.servlet.http.HttpServletRequestWrapper(r) {
                    public ServletInputStream getInputStream() {
                        var in = new java.io.ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8));
                        return new ServletInputStream() {
                            public int read() { return in.read(); }
                            public boolean isFinished() { return in.available() == 0; }
                            public boolean isReady() { return true; }
                            public void setReadListener(ReadListener l) {}
                        };
                    }
                    public java.io.BufferedReader getReader() { return new java.io.BufferedReader(new java.io.StringReader(body)); }
                }, res);
            };
        }
    }

    @Configuration
    @EnableAutoConfiguration
    @Import(McpClientConfig.class)
    static class Client {}

    public static void main(String[] args) throws Exception {
        try { run(); } catch (Throwable t) { t.printStackTrace(System.out); } finally { LOG.forEach(l -> System.out.println("SERVER " + l)); System.exit(0); }
    }

    static void run() throws Exception {
        RSAKey key = new RSAKeyGenerator(2048).keyID("k1").generate();
        HttpServer auth = HttpServer.create(new InetSocketAddress(0), 0);
        auth.createContext("/jwks", ex -> reply(ex, new JWKSet(key.toPublicJWK()).toString()));
        auth.createContext("/token", ex -> {
            TOKENS.incrementAndGet();
            String form = new String(ex.getRequestBody().readAllBytes());
            System.out.println("TOKEN REQUEST " + form + " basic=" + (ex.getRequestHeaders().getFirst("Authorization") != null));
            try {
                var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("k1").build(), new JWTClaimsSet.Builder()
                        .subject("support-assistant").issuer("https://login.example.com").claim("scope", "mcp shipments.read")
                        .expirationTime(Date.from(Instant.now().plusSeconds(300))).build());
                jwt.sign(new RSASSASigner(key));
                reply(ex, "{\"access_token\":\"" + jwt.serialize() + "\",\"token_type\":\"Bearer\",\"expires_in\":300,\"scope\":\"mcp shipments.read\"}");
            } catch (JOSEException e) { throw new IOException(e); }
        });
        auth.start();
        int authPort = auth.getAddress().getPort();

        ConfigurableApplicationContext server = new SpringApplicationBuilder(com.example.shipping.ShippingMcpApplication.class, HeaderLog.class).run(
                "--server.port=18090", "--logging.level.root=WARN", "--spring.ai.mcp.client.enabled=false",
                "--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:" + authPort + "/jwks");
        JdbcClient jdbc = server.getBean(JdbcClient.class);
        jdbc.sql("CREATE TABLE shipments (tracking_number VARCHAR(40), carrier VARCHAR(20), status VARCHAR(20), last_scan VARCHAR(80), last_scan_at TIMESTAMP WITH TIME ZONE, estimated_delivery DATE)").update();
        jdbc.sql("INSERT INTO shipments VALUES ('1Z999AA10123456784', 'UPS', 'IN_TRANSIT', 'Leipzig hub', TIMESTAMP WITH TIME ZONE '2026-11-17 21:04:00+00', DATE '2026-11-19')").update();

        ConfigurableApplicationContext client = new SpringApplicationBuilder(Client.class).run(
                "--spring.main.web-application-type=none", "--logging.level.root=WARN", "--spring.ai.mcp.server.enabled=false",
                "--spring.ai.mcp.client.streamable-http.connections.shipping.url=http://localhost:18090",
                "--spring.security.oauth2.client.registration.shipping.client-id=support-assistant",
                "--spring.security.oauth2.client.registration.shipping.client-secret=s3cret",
                "--spring.security.oauth2.client.registration.shipping.authorization-grant-type=client_credentials",
                "--spring.security.oauth2.client.registration.shipping.scope=mcp,shipments.read",
                "--spring.security.oauth2.client.registration.shipping.provider=acme",
                "--spring.security.oauth2.client.provider.acme.token-uri=http://127.0.0.1:" + authPort + "/token",
                "--support.mcp.allowed-tools=track_shipment");
        var provider = client.getBean(SyncMcpToolCallbackProvider.class);
        var tools = provider.getToolCallbacks();
        System.out.println("TOOLS " + Arrays.stream(tools).map(t -> t.getToolDefinition().name()).toList());
        for (int i = 0; i < 2; i++) {
            System.out.println("CALL " + tools[0].call("{\"trackingNumber\":\"1Z999AA10123456784\"}", new ToolContext(Map.of("customerId", "alice"))));
        }
        System.out.println("TOKEN REQUESTS " + TOKENS.get());
        client.close();
        server.close();
        auth.stop(0);
    }

    static String abbreviate(String s) { return s.length() > 300 ? s.substring(0, 300) : s; }

    static void reply(com.sun.net.httpserver.HttpExchange ex, String body) throws IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(200, b.length);
        ex.getResponseBody().write(b);
        ex.close();
    }
}
