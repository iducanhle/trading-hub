package com.earningstracker.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ClockConfig {

    /** Injected wherever "now" matters (quotas, date windows, cache freshness) so tests can fix time. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
