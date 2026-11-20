package mcpprobe;

import java.util.*;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

public class ResilienceProbe {
    static String root(Throwable e) { while (e.getCause() != null) e = e.getCause(); return e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage()).lines().findFirst().orElse(""); }

    static String chat(ToolCallbackProvider provider) {
        ChatModel model = new ChatModel() {
            public ChatResponse call(org.springframework.ai.chat.prompt.Prompt p) {
                var last = p.getInstructions().getLast();
                AssistantMessage reply = last instanceof org.springframework.ai.chat.messages.ToolResponseMessage t
                        ? new AssistantMessage("model saw: " + t.getResponses().getFirst().responseData())
                        : AssistantMessage.builder().content("").toolCalls(List.of(new AssistantMessage.ToolCall("c1", "function", "orderStatus", "{\"orderNumber\":\"7\"}"))).build();
                return new ChatResponse(List.of(new Generation(reply)));
            }
            public org.springframework.ai.chat.prompt.ChatOptions getOptions() { return org.springframework.ai.model.tool.ToolCallingChatOptions.builder().build(); }
        };
        return ChatClient.builder(model).defaultTools(provider).build().prompt().user("x").call().content();
    }

    public static void main(String[] args) {
        try { run(); } catch (Throwable t) { System.out.println("FAILED " + root(t)); } finally { System.exit(0); }
    }

    static void run() {
        String[] common = { "--spring.ai.openai.api-key=dummy", "--spring.ai.model.chat=none", "--spring.ai.model.embedding=none", "--spring.ai.vectorstore.type=none",
                "--spring.ai.session.repository.jdbc.initialize-schema=never", "--logging.level.root=OFF" };
        List<String> c = new ArrayList<>(List.of(common));
        c.addAll(List.of("--spring.main.web-application-type=none", "--spring.ai.mcp.server.enabled=false", "--spring.ai.mcp.client.initialized=false",
                "--spring.ai.mcp.client.request-timeout=5s", "--spring.ai.mcp.client.streamable-http.connections.orders.url=http://localhost:18083"));
        ConfigurableApplicationContext client = new SpringApplicationBuilder(McpProbe.ClientApp.class).run(c.toArray(String[]::new));
        System.out.println("client started with server down (initialized=false)");
        ToolCallbackProvider provider = client.getBean(ToolCallbackProvider.class);
        try { System.out.println("tools while down: " + provider.getToolCallbacks().length); } catch (Exception e) { System.out.println("getToolCallbacks while down threw " + root(e)); }
        try {
            System.out.println("chat call while down: " + chat(provider));
        } catch (Exception e) { System.out.println("chat call while down threw " + root(e)); }

        List<String> s = new ArrayList<>(List.of(common));
        s.addAll(List.of("--server.port=18083", "--spring.ai.mcp.server.name=orders", "--spring.ai.mcp.server.protocol=STREAMABLE", "--spring.ai.mcp.client.enabled=false"));
        ConfigurableApplicationContext server = new SpringApplicationBuilder(McpProbe.ServerApp.class).run(s.toArray(String[]::new));
        System.out.println("server up");
        try { System.out.println("tools after server up: " + Arrays.stream(provider.getToolCallbacks()).map(t -> t.getToolDefinition().name()).toList()); } catch (Exception e) { System.out.println("after up threw " + root(e)); }
        try { System.out.println("call: " + Arrays.stream(provider.getToolCallbacks()).filter(t -> t.getToolDefinition().name().equals("orderStatus")).findFirst().orElseThrow().call("{\"orderNumber\":\"7\"}")); } catch (Exception e) { System.out.println("call threw " + root(e)); }
        System.out.println("chat with server up: " + chat(provider));
        server.close();
        System.out.println("server stopped");
        try { System.out.println("chat after server down: " + chat(provider)); } catch (Exception e) { System.out.println("chat after down threw " + root(e)); }
        try { System.out.println("tools after server down again: " + provider.getToolCallbacks().length); } catch (Exception e) { System.out.println("after down threw " + root(e)); }
        try { System.out.println("call: " + Arrays.stream(provider.getToolCallbacks()).filter(t -> t.getToolDefinition().name().equals("orderStatus")).findFirst().orElseThrow().call("{\"orderNumber\":\"7\"}")); } catch (Exception e) { System.out.println("call after down threw " + root(e)); }
    }
}
