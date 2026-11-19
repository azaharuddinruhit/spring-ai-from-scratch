package com.example.probe;

import java.util.ArrayList;
import java.util.List;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.CallAdvisor;
import org.springframework.ai.chat.client.advisor.api.CallAdvisorChain;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.core.Ordered;

/**
 * Compiled and run against this classpath (2.1.0-RC2) and Module 6's (2.0.2): a scripted model reports 100/10 tokens on the
 * tool-call turn and 200/20 on the answer. Prints the usage an advisor before ToolCallingAdvisor sees, what an advisor after it
 * sees on each call, and what the caller gets.
 */
public class UsageSumProbe {

    static class Tools {
        @Tool(description = "Look up an order")
        String findOrder(String orderId) {
            return "SHIPPED";
        }
    }

    record Spy(String name, int order, List<String> seen) implements CallAdvisor {
        @Override
        public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
            ChatClientResponse response = chain.nextCall(request);
            Usage u = response.chatResponse().getMetadata().getUsage();
            seen.add(name + " " + u.getPromptTokens() + "/" + u.getCompletionTokens() + "/" + u.getTotalTokens());
            return response;
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public int getOrder() {
            return order;
        }
    }

    public static void main(String[] args) {
        int[] calls = { 0 };
        ChatModel model = new ChatModel() {
            @Override
            public ChatOptions getOptions() {
                return ToolCallingChatOptions.builder().build();
            }

            @Override
            public ChatResponse call(Prompt prompt) {
                calls[0]++;
                AssistantMessage reply = calls[0] == 1
                        ? AssistantMessage.builder().toolCalls(List.of(new AssistantMessage.ToolCall("c1", "function", "findOrder", "{\"orderId\":\"A-1\"}"))).build()
                        : AssistantMessage.builder().content("Shipped.").build();
                var usage = calls[0] == 1 ? new DefaultUsage(100, 10) : new DefaultUsage(200, 20);
                return new ChatResponse(List.of(new Generation(reply)), ChatResponseMetadata.builder().usage(usage).build());
            }
        };
        List<String> seen = new ArrayList<>();
        ChatResponse response = ChatClient.builder(model).defaultTools(new Tools())
                .defaultAdvisors(new Spy("before", Ordered.HIGHEST_PRECEDENCE + 100, seen), new Spy("after", 0, seen))
                .build().prompt().user("Where is A-1?").call().chatResponse();
        Usage u = response.getMetadata().getUsage();
        System.out.println("PROBE model calls " + calls[0]);
        seen.forEach(s -> System.out.println("PROBE advisor " + s));
        System.out.println("PROBE caller " + u.getPromptTokens() + "/" + u.getCompletionTokens() + "/" + u.getTotalTokens()
                + " " + u.getClass().getSimpleName());
    }
}
