package com.example.support.knowledge;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.document.Document;
import org.springframework.ai.rag.retrieval.search.VectorStoreDocumentRetriever;
import org.springframework.ai.session.DefaultSessionService;
import org.springframework.ai.session.InMemorySessionRepository;
import org.springframework.ai.session.SessionService;
import org.springframework.ai.session.advisor.SessionAdvisors;
import org.springframework.core.Ordered;
import org.springframework.ai.vectorstore.SimpleVectorStore;

class KnowledgeRagAdvisorTest {

    private final List<String> answerPrompts = new ArrayList<>();
    private final List<String> rewritePrompts = new ArrayList<>();
    private final SessionService sessionService = DefaultSessionService.builder()
            .sessionRepository(InMemorySessionRepository.builder().build())
            .build();
    private final SimpleVectorStore vectorStore = SimpleVectorStore.builder(new KeywordEmbeddingModel()).build();

    /** Answers the compression call with a standalone question, and records every prompt. */
    private final ChatModel model = prompt -> {
        String text = prompt.getUserMessage().getText();
        if (text.contains("Standalone query:")) {
            rewritePrompts.add(text);
            return reply(text.contains("gift cards?") ? "How long do gift card refunds take?" : "How long do refunds take?");
        }
        answerPrompts.add(text);
        return reply("Done.");
    };

    private final ChatClient chatClient = ChatClient.builder(model)
            .defaultAdvisors(SessionAdvisors.builder(sessionService)
                    .memory(memory -> memory.order(Ordered.HIGHEST_PRECEDENCE + 210))
                    .build())
            .defaultAdvisors(new KnowledgeRagConfig().knowledgeRagAdvisor(ChatClient.builder(model), vectorStore))
            .build();

    KnowledgeRagAdvisorTest() {
        vectorStore.add(List.of(
                chunk("Refunds take 5 business days.", "billing", Audience.CUSTOMER),
                chunk("Gift card refunds take 10 business days.", "billing", Audience.CUSTOMER),
                chunk("Refunds over 500 USD need a manager override.", "billing", Audience.STAFF)));
    }

    @Test
    void augmentsTheQuestionWithCustomerDocumentsOnly() {
        ask("How long do refunds take?");

        assertThat(answerPrompts.getLast())
                .contains("Refunds take 5 business days.")
                .doesNotContain("manager override");
    }

    @Test
    void memoryStoresTheQuestionNotTheAugmentedPrompt() {
        ask("How long do refunds take?");

        assertThat(sessionService.getMessages("c1"))
                .extracting(Message::getText)
                .containsExactly("How long do refunds take?", "Done.");
    }

    @Test
    void aFollowUpIsRewrittenWithTheHistoryBeforeTheSearch() {
        ask("How long do refunds take?");
        ask("And for gift cards?");

        assertThat(rewritePrompts.getLast()).contains("How long do refunds take?", "And for gift cards?");
        assertThat(answerPrompts.getLast())
                .contains("Gift card refunds take 10 business days.")
                .contains("Query: And for gift cards?");
    }

    private void ask(String question) {
        chatClient.prompt()
                .user(question)
                .advisors(SessionAdvisors.session("c1"))
                .advisors(advisor -> advisor
                        .param(VectorStoreDocumentRetriever.FILTER_EXPRESSION, KnowledgeFilters.customerDocuments("billing")))
                .call()
                .content();
    }

    private static ChatResponse reply(String text) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
    }

    private static Document chunk(String text, String product, Audience audience) {
        return new Document(text, Map.of(KnowledgeFilters.PRODUCT, product, KnowledgeFilters.AUDIENCE, audience.name()));
    }
}
