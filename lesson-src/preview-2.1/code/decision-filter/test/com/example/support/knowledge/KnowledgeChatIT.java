package com.example.support.knowledge;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * The whole retrieval path against a local Ollama: nomic-embed-text, d1-omni:600m and llama3.2:3b. The decision model is
 * deterministic, so these are the passages it let through when the lesson was recorded.
 */
@Tag("ollama")
@SpringBootTest
class KnowledgeChatIT {

    @Autowired
    KnowledgeChatService service;

    @Test
    void onlyThePassageThatAnswersReachesThePrompt() {
        var answer = service.answer("How many days do I have to return a blender?");

        assertThat(answer.sources()).extracting(KnowledgeChatService.Source::id).containsExactly("returns");
        assertThat(answer.text()).contains("30");
    }

    @Test
    void theInjectedPassagesNeverReachThePrompt() {
        assertThat(service.answer("Can I change the delivery address after my order has shipped?").sources()).isEmpty();
        assertThat(service.answer("Is the PB-200 blender dishwasher safe?").sources())
                .extracting(KnowledgeChatService.Source::id).containsExactly("pb200-care");
    }
}
