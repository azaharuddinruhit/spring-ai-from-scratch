package com.example.support.knowledge;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.rag.Query;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.rag.generation.augmentation.ContextualQueryAugmenter;
import org.springframework.ai.rag.preretrieval.query.transformation.CompressionQueryTransformer;
import org.springframework.ai.rag.preretrieval.query.transformation.QueryTransformer;
import org.springframework.ai.rag.retrieval.search.VectorStoreDocumentRetriever;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(KnowledgeProperties.class)
class KnowledgeRagConfig {

    @Bean
    RetrievalAugmentationAdvisor knowledgeRagAdvisor(ChatClient.Builder builder, VectorStore vectorStore,
            KnowledgeProperties knowledge) {
        // Turns a follow-up such as "and for gift cards?" into a standalone question, using the history.
        QueryTransformer compression = CompressionQueryTransformer.builder()
                .chatClientBuilder(builder.clone().defaultOptions(ChatOptions.builder().model(knowledge.rewriteModel())))
                .build();
        return RetrievalAugmentationAdvisor.builder()
                // The transformer calls the model for every question, a first one too, and can garble it.
                .queryTransformers(query -> isFollowUp(query) ? compression.transform(query) : query)
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

    /** The history is the whole prompt so far, this question included: a follow-up comes after an answer. */
    private static boolean isFollowUp(Query query) {
        return query.history().stream().anyMatch(message -> message.getMessageType() == MessageType.ASSISTANT);
    }
}
