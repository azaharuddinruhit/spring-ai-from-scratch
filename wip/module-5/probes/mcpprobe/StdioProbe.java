package mcpprobe;

import java.nio.file.Path;
import java.util.*;

import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

public class StdioProbe {

    /** The STDIO server: started by the client as a child process. */
    @Configuration
    @EnableAutoConfiguration
    @Import(McpProbe.OrderTools.class)
    public static class Server {
        public static void main(String[] args) {
            List<String> a = new ArrayList<>(List.of("--spring.ai.openai.api-key=dummy", "--spring.ai.model.chat=none", "--spring.ai.model.embedding=none",
                    "--spring.ai.vectorstore.type=none", "--spring.ai.chat.memory.repository.jdbc.initialize-schema=never",
                    "--spring.main.web-application-type=none", "--spring.ai.mcp.server.stdio=true", "--spring.ai.mcp.server.name=orders-stdio",
                    "--spring.ai.mcp.client.enabled=false"));
            a.addAll(List.of(args));
            new SpringApplicationBuilder(Server.class).run(a.toArray(String[]::new));
        }
    }

    @Configuration
    @EnableAutoConfiguration
    public static class Client {}

    public static void main(String[] args) {
        String argFile = Path.of("cp.arg").toAbsolutePath().toString().replace('\\', '/');
        for (String mode : new String[] { "quiet", "default" }) {
            System.out.println("\n=== server output: " + mode);
            List<String> serverArgs = new ArrayList<>(List.of("@" + argFile, "mcpprobe.StdioProbe$Server"));
            if (mode.equals("quiet")) serverArgs.addAll(List.of("--spring.main.banner-mode=off", "--logging.pattern.console="));
            List<String> clientArgs = new ArrayList<>(List.of("--spring.ai.openai.api-key=dummy", "--spring.ai.model.chat=none", "--spring.ai.model.embedding=none",
                    "--spring.ai.vectorstore.type=none", "--spring.ai.chat.memory.repository.jdbc.initialize-schema=never",
                    "--spring.main.web-application-type=none", "--spring.ai.mcp.server.enabled=false", "--logging.level.root=ERROR",
                    "--spring.ai.mcp.client.request-timeout=15s",
                    "--spring.ai.mcp.client.stdio.connections.orders.command=java"));
            for (int i = 0; i < serverArgs.size(); i++) clientArgs.add("--spring.ai.mcp.client.stdio.connections.orders.args[" + i + "]=" + serverArgs.get(i));
            long start = System.currentTimeMillis();
            try (var ctx = new SpringApplicationBuilder(Client.class).run(clientArgs.toArray(String[]::new))) {
                List<ToolCallback> callbacks = new ArrayList<>();
                ctx.getBeansOfType(ToolCallbackProvider.class).values().forEach(p -> callbacks.addAll(List.of(p.getToolCallbacks())));
                System.out.println("tools: " + callbacks.stream().map(c -> c.getToolDefinition().name()).toList() + " after " + (System.currentTimeMillis() - start) + " ms");
                var status = callbacks.stream().filter(c -> c.getToolDefinition().name().equals("orderStatus")).findFirst().orElseThrow();
                System.out.println("call: " + status.call("{\"orderNumber\":\"1042\"}"));
            } catch (Exception e) {
                Throwable root = e; while (root.getCause() != null) root = root.getCause();
                System.out.println("failed after " + (System.currentTimeMillis() - start) + " ms: " + root.getClass().getSimpleName() + ": " + String.valueOf(root.getMessage()).lines().findFirst().orElse(""));
            }
        }
        System.exit(0);
    }
}
