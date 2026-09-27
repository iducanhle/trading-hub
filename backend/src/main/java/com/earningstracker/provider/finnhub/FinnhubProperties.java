package com.earningstracker.provider.finnhub;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** @param minInterval spacing between calls; 1.1 s keeps us under the free tier's 60 calls/min */
@ConfigurationProperties("app.providers.finnhub")
public record FinnhubProperties(String apiKey, String baseUrl, Duration minInterval) {
}
