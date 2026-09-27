package com.earningstracker.service;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** @param windowDays N trading days before the pre-close and after the reaction day (§5) */
@ConfigurationProperties("app.earnings")
public record EarningsProperties(int windowDays) {
}
