package com.example.support.cost;

import java.math.BigDecimal;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import org.springframework.ai.chat.metadata.Usage;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** List prices by model name, as the request names the model. */
@Validated
@ConfigurationProperties("support.cost")
public record CostProperties(@NotEmpty Map<String, @Valid Price> prices) {

    /** USD per million tokens. */
    public record Price(@NotNull BigDecimal input, @NotNull BigDecimal cachedInput, @NotNull BigDecimal output) {

        /** The prompt-token count includes the tokens read from the provider's cache, which cost less. */
        BigDecimal of(Usage usage) {
            long cached = usage.getCacheReadInputTokens() == null ? 0 : usage.getCacheReadInputTokens();
            return input.multiply(BigDecimal.valueOf(usage.getPromptTokens() - cached))
                    .add(cachedInput.multiply(BigDecimal.valueOf(cached)))
                    .add(output.multiply(BigDecimal.valueOf(usage.getCompletionTokens())))
                    .movePointLeft(6);
        }
    }
}
