package com.earningstracker.provider.fmp;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Optional: without {@code FMP_API_KEY} the provider is disabled. @param dailyLimit free tier: 250 calls/day */
@ConfigurationProperties("app.providers.fmp")
public record FmpProperties(String apiKey, String baseUrl, Duration minInterval, int dailyLimit) {
}
