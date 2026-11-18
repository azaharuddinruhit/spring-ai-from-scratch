package com.example.support.chat;

import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.AdvisorChain;
import org.springframework.ai.chat.client.advisor.api.BaseAdvisor;
import org.springframework.core.Ordered;

/** Masks e-mail addresses and card numbers in the user message before memory, logs or the model see it. */
public final class PiiRedactionAdvisor implements BaseAdvisor {

    private static final Map<Pattern, String> RULES = Map.of(
            Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"), "[email]",
            Pattern.compile("\\b(?:\\d[ -]?){12,18}\\d\\b"), "[card]");

    @Override
    public int getOrder() {
        // Before memory (+200), so the conversation is stored already redacted.
        return Ordered.HIGHEST_PRECEDENCE + 100;
    }

    @Override
    public ChatClientRequest before(ChatClientRequest request, AdvisorChain chain) {
        return request.mutate()
                .prompt(request.prompt().augmentUserMessage(user -> user.mutate().text(redact(user.getText())).build()))
                .build();
    }

    @Override
    public ChatClientResponse after(ChatClientResponse response, AdvisorChain chain) {
        return response;
    }

    static String redact(String text) {
        String result = text;
        for (var rule : RULES.entrySet()) {
            result = rule.getKey().matcher(result).replaceAll(rule.getValue());
        }
        return result;
    }
}
