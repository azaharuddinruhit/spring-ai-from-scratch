package com.example.support.chat;

import java.time.Clock;
import java.util.List;

import com.example.support.mcp.BestEffortToolCallbacks;
import com.example.support.order.OrderTools;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.SafeGuardAdvisor;
import org.springframework.ai.chat.client.advisor.SimpleLoggerAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.mcp.SyncMcpToolCallbackProvider;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration(proxyBeanMethods = false)
class SupportChatConfig {

    @Bean
    ChatClient supportChatClient(ChatClient.Builder builder, ChatMemory chatMemory,
                                RetrievalAugmentationAdvisor knowledgeRagAdvisor, OrderTools orderTools,
                                SyncMcpToolCallbackProvider mcpTools) {
        return builder
                .defaultSystem("You are the support assistant for Acme Cloud.")
                .defaultAdvisors(
                        SafeGuardAdvisor.builder()
                                .sensitiveWords(List.of("internal only", "api_key"))
                                .order(Ordered.HIGHEST_PRECEDENCE + 25)
                                .build(),
                        new TokenBudgetAdvisor(200_000, Clock.systemUTC()),   // + 50
                        new PiiRedactionAdvisor(),                            // + 100
                        MessageChatMemoryAdvisor.builder(chatMemory).build(), // + 200
                        knowledgeRagAdvisor,                                  // + 225
                        new AnswerLanguageAdvisor(),                          // + 250
                        new SimpleLoggerAdvisor())                            // 0
                .defaultTools(orderTools, new BestEffortToolCallbacks(mcpTools))
                .build();
    }

    @Bean
    ChatClient faqChatClient(ChatClient.Builder builder, VectorStore vectorStore) {
        return builder
                .defaultSystem("Answer questions about Acme Cloud plans and billing.")
                .defaultAdvisors(new PiiRedactionAdvisor(), new SemanticCacheAdvisor(vectorStore, 0.92))
                .build();
    }
}
