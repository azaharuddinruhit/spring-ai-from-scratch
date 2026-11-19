package com.example.support.cost;

import java.util.Map;

import com.example.support.cost.CostProperties.Price;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.observation.ChatModelObservationContext;
import org.springframework.ai.chat.prompt.ChatOptions;

/** Counts what each model call costs, tagged like Spring AI's token metric so the two line up on a dashboard. */
class TokenCostMeter implements ObservationHandler<ChatModelObservationContext> {

    private static final Logger log = LoggerFactory.getLogger(TokenCostMeter.class);

    private final MeterRegistry meterRegistry;
    private final Map<String, Price> prices;

    TokenCostMeter(MeterRegistry meterRegistry, Map<String, Price> prices) {
        this.meterRegistry = meterRegistry;
        this.prices = prices;
    }

    @Override
    public void onStop(ChatModelObservationContext context) {
        ChatResponse response = context.getResponse();
        ChatOptions options = context.getRequest().getOptions();
        if (response == null || options == null || options.getModel() == null) {
            return; // the call failed, or named no model
        }
        String model = options.getModel();
        Price price = prices.get(model);
        if (price == null) {
            log.warn("No price for model {}, so its calls are missing from support.ai.cost", model);
            return;
        }
        Counter.builder("support.ai.cost")
                .description("Model spend at list price")
                .baseUnit("usd")
                .tag("gen_ai.request.model", model)
                .register(meterRegistry)
                .increment(price.of(response.getMetadata().getUsage()).doubleValue());
    }

    @Override
    public boolean supportsContext(Observation.Context context) {
        return context instanceof ChatModelObservationContext;
    }
}
