package com.example.support.knowledge;

import java.util.List;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.document.Document;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter;
import org.springframework.ai.rag.postretrieval.document.DecisionDocumentReranker;
import org.springframework.stereotype.Service;

/** Answers a question from the knowledge base and reports which passages the answer was given, and why they passed. */
@Service
public class KnowledgeChatService {

    private final ChatClient supportChatClient;

    public KnowledgeChatService(ChatClient supportChatClient) {
        this.supportChatClient = supportChatClient;
    }

    public Answer answer(String question) {
        ChatResponse response = supportChatClient.prompt().user(question).call().chatResponse();
        List<Document> context = response.getMetadata().getOrDefault(RetrievalAugmentationAdvisor.DOCUMENT_CONTEXT, List.of());
        return new Answer(response.getResult().getOutput().getText(), context.stream().map(Source::of).toList());
    }

    public record Answer(String text, List<Source> sources) {}

    /**
     * A passage in the prompt, with the filter's classification and the reranker's score from its metadata. The score is null
     * when the reranker ran out of time: it keeps the passages it couldn't score after the scored ones.
     */
    public record Source(String id, String classification, Double rerankScore) {

        static Source of(Document document) {
            return new Source(document.getId(),
                    (String) document.getMetadata().get(DecisionDocumentFilter.CLASSIFICATION_METADATA_KEY),
                    (Double) document.getMetadata().get(DecisionDocumentReranker.SCORE_METADATA_KEY));
        }
    }
}
