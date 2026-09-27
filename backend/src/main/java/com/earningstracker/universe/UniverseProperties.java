package com.earningstracker.universe;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param resource          classpath CSV of the EU seed universe
 * @param validateOnStartup check every symbol against Yahoo in the background after startup
 */
@ConfigurationProperties("app.universe")
public record UniverseProperties(String resource, boolean validateOnStartup) {
}
