package com.earningstracker.provider.compass;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** The Compass Economic Calendar feed: static JSON on GitHub Pages, no key. */
@ConfigurationProperties("app.providers.compass")
public record CompassProperties(String baseUrl, Duration minInterval) {
}
