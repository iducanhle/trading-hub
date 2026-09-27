package com.earningstracker.provider;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import com.earningstracker.market.Region;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param chains per capability and region, provider ids in fallback order
 * @param http   shared HTTP client, retry and rate-limit settings
 */
@ConfigurationProperties("app.providers")
public record ProviderSettings(Map<Capability, Map<Region, List<String>>> chains, Http http) {

    /**
     * @param maxAttempts    attempts per call including the first; only transient failures are retried
     * @param initialBackoff first retry delay; doubles each attempt with ±50% jitter
     * @param permitTimeout  longest wait for a rate-limit permit before giving up
     */
    public record Http(Duration connectTimeout, Duration readTimeout, int maxAttempts, Duration initialBackoff,
            Duration permitTimeout) {
    }

    public ProviderSettings {
        chains = chains == null ? Map.of() : chains;
    }
}
