package com.example.assistant;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class AssistantConfig {

    @Bean
    ChatClient assistantChatClient(ChatClient.Builder builder, OrderTools tools) {
        return builder
                .defaultSystem("""
                        You are the support assistant of an online shop. Look orders up with the tools; never invent order
                        details. Answer in one or two sentences.""")
                .defaultTools(tools)
                .build();
    }
}
