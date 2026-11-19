package com.example.support.chat;

import java.time.Clock;
import java.util.List;

import com.example.support.order.OrderTools;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.SafeGuardAdvisor;
import org.springframework.ai.chat.client.advisor.SimpleLoggerAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration(proxyBeanMethods = false)
class SupportChatConfig {

    @Bean
    ChatClient supportChatClient(ChatClient.Builder builder, ChatMemory chatMemory,
                                RetrievalAugmentationAdvisor knowledgeRagAdvisor, OrderTools orderTools) {
        return builder
                .defaultSystem("""
                        You are the support assistant for Acme Cloud.
                        Answer questions about policies, prices and shipping only from the context you are given. If it
                        doesn't hold the answer, say you don't know and offer to pass the question to a support agent.
                        Use the tools for questions about the customer's own orders and refunds.""")
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
                .defaultTools(orderTools)
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
