package com.example.support.knowledge;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.decision.DecisionModel;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter;
import org.springframework.ai.rag.postretrieval.document.DecisionDocumentReranker;
import org.springframework.ai.rag.retrieval.search.VectorStoreDocumentRetriever;
import org.springframework.ai.vectorstore.SimpleVectorStore;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Vector search, then a decision model screens and reranks the passages before they reach the prompt. */
@Configuration
class KnowledgeConfig {

    @Bean
    SimpleVectorStore vectorStore(EmbeddingModel embeddingModel) {
        return SimpleVectorStore.builder(embeddingModel).build();
    }

    @Bean
    DecisionDocumentFilter documentFilter(DecisionModel decisionModel, KnowledgeProperties properties) {
        KnowledgeProperties.Screening screening = properties.screening();
        return DecisionDocumentFilter.builder(decisionModel)
                .policy(screening.policy())
                .failClosed(screening.failClosed())
                .timeout(screening.timeout())
                .build();
    }

    @Bean
    DecisionDocumentReranker documentReranker(DecisionModel decisionModel, KnowledgeProperties properties) {
        return DecisionDocumentReranker.builder(decisionModel)
                .topK(properties.reranking().topK())
                .minimumScore(properties.reranking().minimumScore())
                .build();
    }

    @Bean
    RetrievalAugmentationAdvisor knowledgeAdvisor(VectorStore vectorStore, DecisionDocumentFilter documentFilter,
            DecisionDocumentReranker documentReranker, KnowledgeProperties properties) {
        return RetrievalAugmentationAdvisor.builder()
                .documentRetriever(VectorStoreDocumentRetriever.builder().vectorStore(vectorStore).topK(properties.topK()).build())
                // In order: drop what fails the screen, then rank what is left and keep the best.
                .documentPostProcessors(documentFilter, documentReranker)
                .build();
    }

    @Bean
    ChatClient supportChatClient(ChatClient.Builder builder, RetrievalAugmentationAdvisor knowledgeAdvisor) {
        return builder
                .defaultSystem("You answer customer questions for an online shop. Answer only from the context you are given.")
                .defaultAdvisors(knowledgeAdvisor)
                .build();
    }
}
