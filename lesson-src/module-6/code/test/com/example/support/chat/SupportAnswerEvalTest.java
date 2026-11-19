package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.support.SupportIntegrationTest;
import com.example.support.chat.SupportChatService.SupportAnswer;
import com.example.support.knowledge.Audience;
import com.example.support.knowledge.KnowledgeIngestionService;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.evaluation.FactCheckingEvaluator;
import org.springframework.ai.chat.evaluation.RelevancyEvaluator;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.evaluation.EvaluationRequest;
import org.springframework.ai.evaluation.Evaluator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;

/** Grades real answers with a judge model. Slow and not free, so it runs in its own Gradle task, not in every build. */
@Tag("eval")
@SupportIntegrationTest
@ActiveProfiles({"it", "eval"})
@Sql("/orders.sql")
class SupportAnswerEvalTest {

    private static final Logger log = LoggerFactory.getLogger(SupportAnswerEvalTest.class);

    /** Questions the knowledge base answers. Add every question a customer complained about. */
    private static final List<String> GOLDEN_QUESTIONS = List.of(
            "How long does a refund take to reach my card?",
            "How many days do I have to ask for a refund?",
            "Which card do you send my refund to?",
            "How soon do you ship an order?",
            "How long does standard delivery take inside the EU?",
            "Where do I find my tracking number?");

    private static final double MIN_PASS_RATE = 0.8;

    @Autowired
    SupportChatService chat;

    @Test
    void answersStayRelevantAndGrounded(@Autowired KnowledgeIngestionService ingestion, @Autowired ChatClient.Builder judge,
                                        @Value("${support.eval.judge-model}") String judgeModel) {
        ingestion.ingest(new ClassPathResource("knowledge/refunds.md"), "billing", Audience.CUSTOMER);
        ingestion.ingest(new ClassPathResource("knowledge/shipping.md"), "billing", Audience.CUSTOMER);
        judge.defaultOptions(ChatOptions.builder().model(judgeModel).temperature(0.0));
        var relevancy = new RelevancyEvaluator(judge);
        var factChecking = FactCheckingEvaluator.builder(judge).build();

        List<EvaluationRequest> graded = GOLDEN_QUESTIONS.stream().map(this::answer).toList();

        assertThat(passRate(relevancy, graded)).as("relevancy pass rate").isGreaterThanOrEqualTo(MIN_PASS_RATE);
        assertThat(passRate(factChecking, graded)).as("fact-checking pass rate").isGreaterThanOrEqualTo(MIN_PASS_RATE);
    }

    private EvaluationRequest answer(String question) {
        SupportAnswer answer = chat.ask("eval-user", UUID.randomUUID(), "billing", question, Locale.ENGLISH);
        return new EvaluationRequest(question, answer.sources(), answer.text());
    }

    private static double passRate(Evaluator evaluator, List<EvaluationRequest> graded) {
        long passed = graded.stream().filter(request -> {
            boolean pass = evaluator.evaluate(request).isPass();
            if (!pass) {
                log.warn("{} failed: {} ({} sources) -> {}", evaluator.getClass().getSimpleName(), request.getUserText(),
                        request.getDataList().size(), request.getResponseContent());
            }
            return pass;
        }).count();
        return (double) passed / graded.size();
    }
}
