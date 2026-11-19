package com.example.support.chat;

import com.example.support.tools.SupportTools;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.tool.toolsearch.ToolIndex;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * The chat client with all ten tools. With tool search enabled in application.yaml, the auto-configured builder uses
 * ToolSearchToolCallingAdvisor instead of ToolCallingAdvisor, so the model sees only the tools its searches find.
 */
@Configuration
class ChatConfig {

    @Bean
    ChatClient supportChatClient(ChatClient.Builder builder, SupportTools tools) {
        return builder
                .defaultSystem("""
                        You are the support assistant of an online shop. Use the tools to look things up and to act.
                        Never invent order details. Answer in at most two sentences.""")
                .defaultTools(tools)
                .build();
    }

    /** Bounds whichever tool index the auto-configuration chose (tool-index-type) by the advisor's own max-results. */
    @Bean
    static BeanPostProcessor boundedToolIndex(Environment environment) {
        int maxResults = Binder.get(environment).bind("spring.ai.chat.client.tool-search-advisor.max-results", Integer.class)
                .orElse(5);
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                return bean instanceof ToolIndex index ? new BoundedToolIndex(index, maxResults) : bean;
            }
        };
    }
}
