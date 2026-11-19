package com.example.assistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The real OpenAiChatModel against a fake OpenAI-compatible server that answers with canned replies and keeps every request
 * body, so the test sees what goes over the wire without a model.
 */
@SpringBootTest
class ReasoningReplayTest {

    static final HttpServer SERVER = start();
    static final List<JsonNode> REQUESTS = new ArrayList<>();
    static final Deque<String> REPLIES = new ArrayDeque<>();
    static final JsonMapper JSON = JsonMapper.builder().build();

    static final String TOOL_CALL = """
            {
              "role": "assistant",
              "reasoning_content": "Look the order up first.",
              "tool_calls": [
                {
                  "id": "call-1",
                  "type": "function",
                  "function": { "name": "findOrder", "arguments": "{\\"orderId\\":\\"A-1042\\"}" }
                }
              ]
            }""";

    static final String ANSWER = """
            {
              "role": "assistant",
              "reasoning_content": "It shipped with DHL.",
              "content": "\\n\\nYour order A-1042 shipped with DHL."
            }""";

    @Autowired
    OrderAssistant assistant;

    @DynamicPropertySource
    static void fakeServer(DynamicPropertyRegistry registry) {
        registry.add("spring.ai.openai.base-url", () -> "http://localhost:" + SERVER.getAddress().getPort() + "/v1");
    }

    @BeforeEach
    void reset() {
        REQUESTS.clear();
        REPLIES.clear();
    }

    @AfterAll
    static void stop() {
        SERVER.stop(0);
    }

    @Test
    void theNextRequestSendsTheReasoningBackWithTheToolCall() {
        REPLIES.addAll(List.of(TOOL_CALL, ANSWER));

        Reply reply = assistant.reply("Where is my order A-1042?");

        JsonNode toolCallTurn = REQUESTS.get(1).get("messages").get(2);
        assertThat(toolCallTurn.get("role").asString()).isEqualTo("assistant");
        assertThat(toolCallTurn.get("reasoning_content").asString()).isEqualTo("Look the order up first.");
        assertThat(reply).isEqualTo(new Reply("Your order A-1042 shipped with DHL.", "It shipped with DHL."));
    }

    @Test
    void ollamasReasoningFieldBecomesAReasoningPartToo() {
        REPLIES.add(ANSWER.replace("reasoning_content", "reasoning"));

        assertThat(assistant.reply("Where is my order A-1042?").reasoning()).isEqualTo("It shipped with DHL.");
    }

    @Test
    void aQuickReplySwitchesThinkingOffWithAJsonBoolean() {
        REPLIES.add(ANSWER);

        assistant.quickReply("Where is my order A-1042?");

        JsonNode flag = REQUESTS.getFirst().get("chat_template_kwargs").get("enable_thinking");
        assertThat(flag.isBoolean()).isTrue();
        assertThat(flag.asBoolean()).isFalse();
    }

    static HttpServer start() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/", exchange -> {
                REQUESTS.add(JSON.readTree(exchange.getRequestBody().readAllBytes()));
                String message = REPLIES.poll();
                String finish = message.contains("tool_calls") ? "tool_calls" : "stop";
                byte[] body = """
                        {
                          "id": "chatcmpl-1",
                          "object": "chat.completion",
                          "created": 0,
                          "model": "fake",
                          "choices": [ { "index": 0, "finish_reason": "%s", "message": %s } ],
                          "usage": { "prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15 }
                        }""".formatted(finish, message).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            server.start();
            return server;
        }
        catch (IOException e) {
            throw new IllegalStateException("Could not start the fake server", e);
        }
    }
}
