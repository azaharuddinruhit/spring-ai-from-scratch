package com.example.support.cost;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import com.example.support.cost.CostProperties.Price;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.observation.ChatModelObservationContext;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;

class TokenCostMeterTest {

    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    private final TokenCostMeter meter = new TokenCostMeter(meterRegistry,
            Map.of("gpt-5-mini", new Price(new BigDecimal("0.25"), new BigDecimal("0.025"), new BigDecimal("2.00"))));

    @Test
    void pricesCachedInputAtTheCachedRate() {
        meter.onStop(call("gpt-5-mini", new DefaultUsage(10_000, 1_000, null, null, 8_000L, null)));

        // 2,000 new input tokens at 0.25, 8,000 cached at 0.025 and 1,000 output at 2.00, per million.
        // Priced from the token metric alone, all 10,000 input tokens would cost 0.25: 0.0045.
        assertThat(meterRegistry.get("support.ai.cost").tag("gen_ai.request.model", "gpt-5-mini").counter().count())
                .isCloseTo(0.0027, within(1e-12));
    }

    @Test
    void leavesOutAModelWithoutAPrice() {
        meter.onStop(call("gpt-5-nano", new DefaultUsage(10_000, 1_000)));

        assertThat(meterRegistry.find("support.ai.cost").counter()).isNull();
    }

    private static ChatModelObservationContext call(String model, Usage usage) {
        ChatModelObservationContext context = ChatModelObservationContext.builder()
                .prompt(new Prompt("Where is my order 1042?", ChatOptions.builder().model(model).build()))
                .provider("openai")
                .build();
        context.setResponse(new ChatResponse(List.of(new Generation(new AssistantMessage("It has shipped."))),
                ChatResponseMetadata.builder().usage(usage).build()));
        return context;
    }
}
