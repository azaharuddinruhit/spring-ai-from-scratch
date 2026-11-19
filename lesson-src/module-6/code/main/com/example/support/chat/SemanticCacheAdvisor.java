package com.example.support.chat;

import java.util.List;
import java.util.Map;

import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.CallAdvisor;
import org.springframework.ai.chat.client.advisor.api.CallAdvisorChain;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.core.Ordered;

/** Answers a first question with the stored answer to a similar one, without calling the model. */
public final class SemanticCacheAdvisor implements CallAdvisor {

    private static final String ANSWER = "answer";
    private static final String KIND = "kind";
    private static final String CACHE_ENTRY = "semantic-cache"; // keeps cache entries apart from other documents

    private final VectorStore vectorStore;
    private final double similarityThreshold;

    public SemanticCacheAdvisor(VectorStore vectorStore, double similarityThreshold) {
        this.vectorStore = vectorStore;
        this.similarityThreshold = similarityThreshold;
    }

    @Override
    public String getName() {
        return "SemanticCacheAdvisor";
    }

    @Override
    public int getOrder() {
        // Just before the tool loop (+300), so a hit skips the tools and the model.
        return Ordered.HIGHEST_PRECEDENCE + 280;
    }

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        if (request.prompt().getUserMessages().size() != 1) {
            return chain.nextCall(request); // a follow-up depends on the history, so another answer doesn't fit it
        }
        String question = request.prompt().getUserMessage().getText();
        List<Document> hits = vectorStore.similaritySearch(SearchRequest.builder()
                .query(question)
                .topK(1)
                .similarityThreshold(similarityThreshold)
                .filterExpression(new FilterExpressionBuilder().eq(KIND, CACHE_ENTRY).build())
                .build());
        if (!hits.isEmpty()) {
            var cached = new AssistantMessage((String) hits.getFirst().getMetadata().get(ANSWER));
            return ChatClientResponse.builder()
                    .chatResponse(new ChatResponse(List.of(new Generation(cached))))
                    .context(request.context())
                    .build();
        }
        ChatClientResponse response = chain.nextCall(request);
        String answer = response.chatResponse().getResult().getOutput().getText();
        if (answer != null && !answer.isBlank()) {
            vectorStore.add(List.of(new Document(question, Map.of(KIND, CACHE_ENTRY, ANSWER, answer))));
        }
        return response;
    }
}
