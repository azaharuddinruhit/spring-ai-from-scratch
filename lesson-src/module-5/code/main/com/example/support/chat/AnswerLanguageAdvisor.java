package com.example.support.chat;

import java.util.Locale;

import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.AdvisorChain;
import org.springframework.ai.chat.client.advisor.api.BaseAdvisor;
import org.springframework.core.Ordered;

/** Tells the model which language to answer in, taken from a per-request advisor parameter. */
public final class AnswerLanguageAdvisor implements BaseAdvisor {

    public static final String LANGUAGE = "support.answer-language";

    @Override
    public int getOrder() {
        // After memory (+200) and before the tool loop (+300), so it runs once per call.
        return Ordered.HIGHEST_PRECEDENCE + 250;
    }

    @Override
    public ChatClientRequest before(ChatClientRequest request, AdvisorChain chain) {
        if (!(request.context().get(LANGUAGE) instanceof Locale locale)) {
            return request;
        }
        String instruction = "Answer in " + locale.getDisplayLanguage(Locale.ENGLISH) + ".";
        return request.mutate()
                .prompt(request.prompt().augmentSystemMessage(system -> system.mutate()
                        .text(system.getText().isEmpty() ? instruction : system.getText() + "\n" + instruction)
                        .build()))
                .build();
    }

    @Override
    public ChatClientResponse after(ChatClientResponse response, AdvisorChain chain) {
        return response;
    }
}
