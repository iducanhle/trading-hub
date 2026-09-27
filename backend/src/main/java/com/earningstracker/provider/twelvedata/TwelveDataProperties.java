package com.earningstracker.provider.twelvedata;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param minInterval spacing between calls; 7.5 s keeps any 60 s window at the free tier's 8 calls
 * @param dailyLimit  calls per UTC day (free tier: 800); when used up, price history falls back to Yahoo
 */
@ConfigurationProperties("app.providers.twelvedata")
public record TwelveDataProperties(String apiKey, String baseUrl, Duration minInterval, int dailyLimit) {
}
