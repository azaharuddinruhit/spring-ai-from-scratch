package com.example.support.routing;

import static com.example.support.routing.TicketRouter.INJECTION;
import static com.example.support.routing.TicketRouter.INTENT;
import static com.example.support.routing.TicketRouter.MOOD;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.ai.decision.DecisionModel;
import org.springframework.ai.decision.DecisionPrompt;
import org.springframework.ai.decision.DecisionResponse;
import org.springframework.ai.decision.answer.ChoiceAnswer;
import org.springframework.ai.decision.answer.DecisionAnswer;
import org.springframework.ai.decision.answer.RefusalAnswer;
import org.springframework.ai.decision.answer.ScoreAnswer;
import org.springframework.ai.decision.answer.YesNoAnswer;

/** The routing rules, with the decision model replaced by fixed answers: no model, no network. */
class TicketRouterTest {

    private final RoutingProperties properties = new RoutingProperties(0.9, 0.6);

    @Test
    void asksAllThreeQuestionsInOneCall() {
        AtomicReference<DecisionPrompt> sent = new AtomicReference<>();
        DecisionModel model = prompt -> {
            sent.set(prompt);
            return answers(prompt, 0.0, "other", 0.99, 1.0);
        };

        new TicketRouter(model, properties).route("Do you sell replacement jugs?");

        assertThat(sent.get().getQuestions()).containsOnlyKeys(INJECTION, INTENT, MOOD);
    }

    @Test
    void injectionFromTheThresholdUpGoesToReview() {
        assertThat(route(0.9, "refund", 0.99, 0.3).route()).isEqualTo(Route.REVIEW);
        assertThat(route(0.89, "refund", 0.99, 0.3).route()).isEqualTo(Route.REFUND);
    }

    @Test
    void anUnsureIntentGoesToAPerson() {
        Routing routing = route(0.0, "order_status", 0.55, 1.0);

        assertThat(routing.route()).isEqualTo(Route.HUMAN);
        assertThat(routing.reason()).isEqualTo("intent order_status at confidence 0.55, below 0.60");
    }

    @Test
    void anUnhappyComplaintGoesToAPersonFirst() {
        assertThat(route(0.03, "complaint", 0.68, 0.03).route()).isEqualTo(Route.PRIORITY_HUMAN);
        assertThat(route(0.03, "complaint", 0.68, 1.0).route()).isEqualTo(Route.HUMAN);
    }

    @Test
    void onlyOtherReachesTheAssistant() {
        assertThat(route(0.0, "other", 0.99, 2.0).route()).isEqualTo(Route.ASSISTANT);
        assertThat(route(0.0, "address_change", 0.99, 1.0).route()).isEqualTo(Route.ADDRESS_CHANGE);
    }

    @Test
    void aRefusedQuestionGoesToAPerson() {
        DecisionModel model = prompt -> DecisionResponse.builder(prompt)
                .answer(INJECTION, YesNoAnswer.builder().probability(0.0).build())
                .answer(INTENT, RefusalAnswer.builder().reason("not a support message").build())
                .answer(MOOD, mood(1.0))
                .build();

        Routing routing = new TicketRouter(model, properties).route("asdfghjkl");

        assertThat(routing.route()).isEqualTo(Route.HUMAN);
        assertThat(routing.reason()).isEqualTo("the decision model refused the intent question");
    }

    private Routing route(double injection, String intent, double confidence, double mood) {
        return new TicketRouter(prompt -> answers(prompt, injection, intent, confidence, mood), properties).route("a ticket");
    }

    private static DecisionResponse answers(DecisionPrompt prompt, double injection, String intent, double confidence, double mood) {
        Map<String, DecisionAnswer> answers = Map.of(
                INJECTION, YesNoAnswer.builder().probability(injection).build(),
                INTENT, ChoiceAnswer.builder().value(intent).confidence(confidence).probabilities(Map.of(intent, confidence)).build(),
                MOOD, mood(mood));
        return DecisionResponse.builder(prompt).answers(answers).build();
    }

    private static ScoreAnswer mood(double value) {
        return ScoreAnswer.builder().value(value).probabilities(List.of(0.0, 0.0, 0.0)).build();
    }
}
