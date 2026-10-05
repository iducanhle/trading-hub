package com.earningstracker.provider.alpaca;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param keyId       API key id of a (free, paper) Alpaca account
 * @param secretKey   its secret
 * @param minInterval spacing between calls; the free plan allows 200 calls/min
 */
@ConfigurationProperties("app.providers.alpaca")
public record AlpacaProperties(String keyId, String secretKey, String baseUrl, Duration minInterval) {
}
