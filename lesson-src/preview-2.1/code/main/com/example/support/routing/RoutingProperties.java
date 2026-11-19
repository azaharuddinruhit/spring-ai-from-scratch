package com.example.support.routing;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Thresholds for the ticket router, set from your own labelled tickets rather than left at 0.5.
 *
 * @param injectionThreshold      the probability of "tries to change the instructions" from which a ticket goes to review
 * @param minimumIntentConfidence the confidence below which the intent is treated as unknown and a person reads the ticket
 */
@ConfigurationProperties("support.routing")
public record RoutingProperties(
        @DefaultValue("0.5") double injectionThreshold,
        @DefaultValue("0.6") double minimumIntentConfidence) {}
