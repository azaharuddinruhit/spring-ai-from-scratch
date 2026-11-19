package com.example.support.knowledge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter.CLASSIFICATION_METADATA_KEY;
import static org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter.CONTAINS_ANSWER_EVIDENCE;
import static org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter.CONTAINS_PROMPT_INJECTION;
import static org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter.CONTRADICTS_QUERY_PREMISE;
import static org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter.IS_RELEVANT;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.ai.decision.DecisionModel;
import org.springframework.ai.decision.DecisionPrompt;
import org.springframework.ai.decision.DecisionResponse;
import org.springframework.ai.decision.answer.YesNoAnswer;
import org.springframework.ai.decision.input.FieldsInput;
import org.springframework.ai.document.Document;
import org.springframework.ai.rag.Query;
import org.springframework.ai.rag.postretrieval.document.DecisionDocumentFilter;
import org.springframework.ai.rag.postretrieval.document.DecisionDocumentReranker;

/**
 * The screening and reranking rules, with the decision model replaced by the probabilities d1-omni:600m gave in the lesson's
 * recording ("How many days do I have to return a blender?"). No model, no network.
 */
class KnowledgeScreeningTest {

    private static final Query QUESTION = new Query("How many days do I have to return a blender?");

    // relevance, evidence, contradiction, injection, rerank score: as recorded.
    private static final Map<String, double[]> RECORDED = Map.of(
            "returns", new double[] {0.971, 0.892, 0.573, 0.346, 0.564},
            "shipping", new double[] {0.867, 0.796, 0.669, 0.045, 0.359},
            "injected-returns", new double[] {0.782, 0.079, 0.265, 0.223, 0.085},
            "pb200-care", new double[] {0.144, 0.063, 0.755, 0.017, 0.013});

    private final KnowledgeConfig config = new KnowledgeConfig();

    @Test
    void theLibraryDefaultsKeepAnUnrelatedPassageThatLooksContradictory() {
        List<Document> kept = defaults().process(QUESTION, passages("returns", "pb200-care"));

        assertThat(kept).extracting(Document::getId).containsExactly("returns", "pb200-care");
        assertThat(kept.get(1).getMetadata()).containsEntry(CLASSIFICATION_METADATA_KEY, "CONFLICTING");
    }

    @Test
    void thisAppsPolicyDropsItAndTheInjectedPassage() {
        List<Document> kept = filter(properties(false, Duration.ofSeconds(30)), recorded())
                .process(QUESTION, passages("returns", "shipping", "injected-returns", "pb200-care"));

        assertThat(kept).extracting(Document::getId).containsExactly("returns", "shipping");
        assertThat(kept).allSatisfy(d -> assertThat(d.getMetadata()).containsEntry(CLASSIFICATION_METADATA_KEY, "INCLUDED"));
    }

    @Test
    void theThresholdsAreStrict() {
        DecisionModel atTheLine = answering(Map.of(IS_RELEVANT, 0.9, CONTAINS_ANSWER_EVIDENCE, 0.55,
                CONTRADICTS_QUERY_PREMISE, 0.0, CONTAINS_PROMPT_INJECTION, 0.7));
        DecisionModel justAbove = answering(Map.of(IS_RELEVANT, 0.9, CONTAINS_ANSWER_EVIDENCE, 0.5501,
                CONTRADICTS_QUERY_PREMISE, 0.0, CONTAINS_PROMPT_INJECTION, 0.7));

        assertThat(DecisionDocumentFilter.builder(atTheLine).build().process(QUESTION, passages("returns"))).isEmpty();
        assertThat(DecisionDocumentFilter.builder(justAbove).build().process(QUESTION, passages("returns"))).hasSize(1);
    }

    @Test
    void aPassageNotScreenedInTimePassesThroughUnlessTheFilterFailsClosed() {
        DecisionModel slow = prompt -> {
            sleep(Duration.ofMillis(500));
            return recorded().call(prompt);
        };
        List<Document> injected = passages("injected-returns");

        List<Document> open = filter(properties(false, Duration.ofMillis(100)), slow).process(QUESTION, injected);
        List<Document> closed = filter(properties(true, Duration.ofMillis(100)), slow).process(QUESTION, injected);

        assertThat(open).extracting(Document::getId).containsExactly("injected-returns");
        assertThat(open.getFirst().getMetadata()).doesNotContainKey(CLASSIFICATION_METADATA_KEY);
        assertThat(closed).isEmpty();
    }

    @Test
    void theRerankerKeepsTheBestPassagesAboveTheMinimumScore() {
        DecisionDocumentReranker reranker = config.documentReranker(recorded(), properties(true, Duration.ofSeconds(30)));

        List<Document> ranked = reranker.process(QUESTION, passages("shipping", "pb200-care", "returns"));

        assertThat(ranked).extracting(Document::getId).containsExactly("returns");
        assertThat(ranked.getFirst().getMetadata()).containsEntry(DecisionDocumentReranker.SCORE_METADATA_KEY, 0.564);
    }

    private DecisionDocumentFilter defaults() {
        return DecisionDocumentFilter.builder(recorded()).build();
    }

    private DecisionDocumentFilter filter(KnowledgeProperties properties, DecisionModel model) {
        return config.documentFilter(model, properties);
    }

    /** The values application.yaml sets, with the failure handling under test. */
    private static KnowledgeProperties properties(boolean failClosed, Duration timeout) {
        return new KnowledgeProperties(6,
                new KnowledgeProperties.Screening(0.7, 1.0, 0.45, 0.55, failClosed, timeout),
                new KnowledgeProperties.Reranking(3, 0.4));
    }

    /** Answers each passage with its recorded probabilities: the filter's four questions, or the reranker's one. */
    private static DecisionModel recorded() {
        return prompt -> {
            String passage = (String) ((FieldsInput) prompt.getInstructions()).getFields().get(DecisionDocumentFilter.PASSAGE_FIELD);
            double[] p = RECORDED.get(idOf(passage));
            Map<String, Double> probabilities = Map.of(IS_RELEVANT, p[0], CONTAINS_ANSWER_EVIDENCE, p[1],
                    CONTRADICTS_QUERY_PREMISE, p[2], CONTAINS_PROMPT_INJECTION, p[3], DecisionDocumentReranker.QUESTION_NAME, p[4]);
            return answer(prompt.getQuestions().keySet(), probabilities, prompt);
        };
    }

    private static DecisionModel answering(Map<String, Double> probabilities) {
        return prompt -> answer(prompt.getQuestions().keySet(), probabilities, prompt);
    }

    private static DecisionResponse answer(Iterable<String> questions, Map<String, Double> probabilities, DecisionPrompt prompt) {
        DecisionResponse.Builder response = DecisionResponse.builder(prompt);
        questions.forEach(name -> response.answer(name, YesNoAnswer.builder().probability(probabilities.get(name)).build()));
        return response.build();
    }

    private static List<Document> passages(String... ids) {
        return Arrays.stream(ids).map(id -> Document.builder().id(id).text("passage " + id).build()).toList();
    }

    private static String idOf(String passage) {
        return passage.substring("passage ".length());
    }

    private static void sleep(Duration duration) {
        try {
            Thread.sleep(duration);
        }
        catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
