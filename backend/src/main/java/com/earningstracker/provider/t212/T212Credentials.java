package com.earningstracker.provider.t212;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Objects;

/**
 * A user's Trading 212 API key. {@code apiSecret} is null for legacy keys, which are sent as the raw
 * {@code Authorization} header. {@link #toString()} never shows the key or the secret.
 */
public record T212Credentials(String apiKey, String apiSecret, T212Environment environment) {

    public T212Credentials {
        Objects.requireNonNull(apiKey, "apiKey");
        Objects.requireNonNull(environment, "environment");
        if (apiSecret != null && apiSecret.isEmpty()) {
            apiSecret = null;
        }
    }

    /** HTTP Basic {@code base64(key:secret)}, or the bare key for legacy keys. */
    public String authorizationHeader() {
        if (apiSecret == null) {
            return apiKey;
        }
        return "Basic " + Base64.getEncoder().encodeToString((apiKey + ":" + apiSecret)
                .getBytes(StandardCharsets.UTF_8));
    }

    /** The last 4 characters of the key, the only part the API ever shows; empty for implausibly short keys. */
    public String keyHint() {
        return apiKey.length() <= 8 ? "" : apiKey.substring(apiKey.length() - 4);
    }

    @Override
    public String toString() {
        return "T212Credentials[environment=" + environment + ", key=…" + keyHint()
                + (apiSecret == null ? ", legacy" : "") + "]";
    }
}
