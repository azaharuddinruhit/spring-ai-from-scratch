package com.example.support.refund;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class RefundConfig {

    /** The confirmation window is measured with this clock, so tests can fix the time. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
