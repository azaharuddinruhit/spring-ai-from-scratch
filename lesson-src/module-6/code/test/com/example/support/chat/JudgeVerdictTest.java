package com.example.support.chat;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.support.ScriptedChatModel;
import java.util.List;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.evaluation.FactCheckingEvaluator;
import org.springframework.ai.chat.evaluation.RelevancyEvaluator;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.document.Document;
import org.springframework.ai.evaluation.EvaluationRequest;

/** Pins how the evaluators read the judge's reply: only the bare word "yes" passes. */
class JudgeVerdictTest {

    private static final EvaluationRequest REQUEST = new EvaluationRequest(
            "How long does a refund take?",
            List.of(new Document("Refunds reach your card 5 to 7 business days after we approve them.")),
            "Refunds take 5 to 7 business days.");

    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            YES                         | true
            ' yes\n'                    | true
            Yes.                        | false
            'YES, it is supported.'     | false
            NO                          | false
            """)
    void onlyABareYesPasses(String verdict, boolean passes) {
        var judge = ChatClient.builder(new ScriptedChatModel(prompt -> new AssistantMessage(verdict.replace("\n", "\n"))));

        assertThat(new RelevancyEvaluator(judge).evaluate(REQUEST).isPass()).isEqualTo(passes);
        assertThat(FactCheckingEvaluator.builder(judge).build().evaluate(REQUEST).isPass()).isEqualTo(passes);
    }
}
