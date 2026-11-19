package com.example.support.knowledge;

import java.time.Duration;

import org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Retrieval settings. The screening and reranking defaults are Spring AI's own, so application.yaml shows what this app changed.
 *
 * @param topK      how many passages the vector search returns before screening
 * @param screening the {@link DecisionDocumentFilter} policy and its failure handling
 * @param reranking how many screened passages reach the prompt, and the lowest reranker score that does
 */
@ConfigurationProperties("support.knowledge")
public record KnowledgeProperties(@DefaultValue("6") int topK, @DefaultValue Screening screening, @DefaultValue Reranking reranking) {

    /**
     * @param injection     above this "tries to instruct the system" probability, a passage is dropped
     * @param contradiction above this "contradicts the question" probability, a passage is kept as CONFLICTING
     * @param relevance     below this "is about the question" probability, a passage is dropped
     * @param evidence      above this "states the answer" probability, a passage is kept as INCLUDED; otherwise it is dropped
     * @param failClosed    drop the passages that couldn't be screened in time, instead of passing them through
     * @param timeout       how long screening all the passages of one question may take
     */
    public record Screening(
            @DefaultValue("0.7") double injection,
            @DefaultValue("0.7") double contradiction,
            @DefaultValue("0.45") double relevance,
            @DefaultValue("0.55") double evidence,
            @DefaultValue("false") boolean failClosed,
            @DefaultValue("1m") Duration timeout) {

        public DecisionDocumentFilter.Policy policy() {
            return new DecisionDocumentFilter.Policy(injection, contradiction, relevance, evidence);
        }
    }

    public record Reranking(@DefaultValue("3") int topK, @DefaultValue("0") double minimumScore) {}
}
