package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;

class AnswerLanguageAdvisorTest {

    private final List<Prompt> prompts = new ArrayList<>();

    private final ChatClient chatClient = ChatClient.builder(prompt -> {
                prompts.add(prompt);
                return new ChatResponse(List.of(new Generation(new AssistantMessage("ok"))));
            })
            .defaultSystem("You are the support assistant for Acme Cloud.")
            .defaultAdvisors(new AnswerLanguageAdvisor())
            .build();

    @Test
    void addsTheLanguageToTheSystemMessage() {
        chatClient.prompt()
                .user("Where is my invoice?")
                .advisors(advisor -> advisor.param(AnswerLanguageAdvisor.LANGUAGE, Locale.GERMAN))
                .call()
                .content();

        assertThat(prompts.getLast().getSystemMessage().getText())
                .isEqualTo("You are the support assistant for Acme Cloud.\nAnswer in German.");
    }

    @Test
    void leavesThePromptAloneWithoutALanguage() {
        chatClient.prompt().user("Where is my invoice?").call().content();

        assertThat(prompts.getLast().getSystemMessage().getText())
                .isEqualTo("You are the support assistant for Acme Cloud.");
    }
}
