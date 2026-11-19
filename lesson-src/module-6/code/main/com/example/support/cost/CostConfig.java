package com.example.support.cost;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CostProperties.class)
class CostConfig {

    /** Boot adds every ObservationHandler bean to the ObservationRegistry. */
    @Bean
    TokenCostMeter tokenCostMeter(MeterRegistry meterRegistry, CostProperties cost) {
        return new TokenCostMeter(meterRegistry, cost.prices());
    }
}
