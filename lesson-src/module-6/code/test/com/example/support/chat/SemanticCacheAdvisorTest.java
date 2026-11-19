package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.never;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;

@ExtendWith(MockitoExtension.class)
class SemanticCacheAdvisorTest {

    @Mock
    private VectorStore vectorStore;

    @Captor
    private ArgumentCaptor<List<Document>> stored;

    private int modelCalls;

    private ChatClient chatClient() {
        return ChatClient.builder(prompt -> {
                    modelCalls++;
                    return new ChatResponse(List.of(new Generation(new AssistantMessage("Open Billing, then Change plan."))));
                })
                .defaultAdvisors(new SemanticCacheAdvisor(vectorStore, 0.92))
                .build();
    }

    @Test
    void answersASimilarQuestionWithoutCallingTheModel() {
        given(vectorStore.similaritySearch(any(SearchRequest.class))).willReturn(List.of(
                new Document("How do I change my plan?", Map.of("answer", "Open Billing, then Change plan."))));

        String answer = chatClient().prompt().user("how can I switch plans").call().content();

        assertThat(answer).isEqualTo("Open Billing, then Change plan.");
        assertThat(modelCalls).isZero();
        then(vectorStore).should(never()).add(anyList());
    }

    @Test
    void storesTheAnswerAfterAMiss() {
        given(vectorStore.similaritySearch(any(SearchRequest.class))).willReturn(List.of());

        chatClient().prompt().user("How do I change my plan?").call().content();

        assertThat(modelCalls).isOne();
        then(vectorStore).should().add(stored.capture());
        assertThat(stored.getValue()).singleElement().satisfies(document -> {
            assertThat(document.getText()).isEqualTo("How do I change my plan?");
            assertThat(document.getMetadata()).containsEntry("answer", "Open Billing, then Change plan.");
        });
    }

    @Test
    void skipsTheCacheForAFollowUp() {
        chatClient().prompt()
                .messages(new UserMessage("I'm on the Team plan."), new AssistantMessage("Thanks."))
                .user("How do I change it?")
                .call()
                .content();

        assertThat(modelCalls).isOne();
        then(vectorStore).shouldHaveNoInteractions();
    }
}
