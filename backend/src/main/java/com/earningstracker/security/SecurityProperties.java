package com.earningstracker.security;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code ALLOWED_EMAILS} and {@code CORS_ALLOWED_ORIGINS}, both comma-separated in the environment. */
@ConfigurationProperties("app.security")
public record SecurityProperties(List<String> allowedEmails, List<String> corsAllowedOrigins) {

    public SecurityProperties {
        allowedEmails = clean(allowedEmails);
        corsAllowedOrigins = clean(corsAllowedOrigins);
    }

    private static List<String> clean(List<String> values) {
        return values == null ? List.of() : values.stream().map(String::strip).filter(v -> !v.isEmpty()).toList();
    }
}
