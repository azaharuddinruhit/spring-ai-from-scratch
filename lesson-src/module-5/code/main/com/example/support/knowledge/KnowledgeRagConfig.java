package com.example.support.knowledge;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.rag.generation.augmentation.ContextualQueryAugmenter;
import org.springframework.ai.rag.preretrieval.query.transformation.CompressionQueryTransformer;
import org.springframework.ai.rag.retrieval.search.VectorStoreDocumentRetriever;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration(proxyBeanMethods = false)
class KnowledgeRagConfig {

    @Bean
    RetrievalAugmentationAdvisor knowledgeRagAdvisor(ChatClient.Builder builder, VectorStore vectorStore) {
        return RetrievalAugmentationAdvisor.builder()
                // Turns a follow-up such as "and for gift cards?" into a standalone question, using the history.
                .queryTransformers(CompressionQueryTransformer.builder()
                        .chatClientBuilder(builder)
                        .build())
                .documentRetriever(VectorStoreDocumentRetriever.builder()
                        .vectorStore(vectorStore)
                        .topK(5)
                        .similarityThreshold(0.5)
                        .filterExpression(KnowledgeFilters.customerDocuments()) // when a call passes no filter
                        .build())
                // An order question finds no documents. The default would then replace it with a refusal, and the model
                // would never call a tool. The system prompt keeps policy answers to the documents instead.
                .queryAugmenter(ContextualQueryAugmenter.builder().allowEmptyContext(true).build())
                // After memory (+ 210), so memory stores the question rather than the augmented prompt,
                // and before tool calling (+ 300), so it retrieves once per question.
                .order(Ordered.HIGHEST_PRECEDENCE + 225)
                .build();
    }
}
