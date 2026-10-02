package com.earningstracker.t212;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The Trading 212 portfolio feature ({@code app.t212}).
 *
 * @param encryptionKey    {@code T212_ENCRYPTION_KEY}: base64 of 32 random bytes; empty turns the feature off
 * @param serverIpHint     {@code T212_SERVER_IP_HINT}: the server's public IP, shown in Settings so users can
 *                         restrict their key to it; may be empty
 * @param liveUrl          host of the real-money API (paths start with {@code /api/v0})
 * @param demoUrl          host of the paper-trading API
 * @param syncInterval     how often the scheduled sync runs for every connected user
 * @param liveCacheTtl     how long account summaries and positions are reused per user
 * @param maxRateLimitWait longest wait for a rate limit to reset before a call fails as rate limited
 */
@ConfigurationProperties("app.t212")
public record T212Properties(String encryptionKey, String serverIpHint, String liveUrl, String demoUrl,
        Duration syncInterval, Duration connectTimeout, Duration readTimeout, Duration liveCacheTtl,
        Duration maxRateLimitWait) {
}
