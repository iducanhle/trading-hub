package com.earningstracker.provider;

/**
 * A provider call failed. Messages are safe to log: they never contain API keys or full URLs.
 */
public class ProviderException extends RuntimeException {

    public enum Kind {
        /** The provider does not know the symbol. */
        NOT_FOUND,
        /** Not available on this provider or plan (e.g. EU data on a US-only free tier). */
        UNSUPPORTED,
        /** Upstream 429 or our own daily quota is used up. */
        RATE_LIMITED,
        /** Network error, timeout or 5xx. */
        UNAVAILABLE,
        /** The response could not be understood. */
        BAD_RESPONSE
    }

    private final String provider;
    private final Kind kind;
    private final boolean retryable;

    public ProviderException(String provider, Kind kind, String message, boolean retryable) {
        super(provider + ": " + message);
        this.provider = provider;
        this.kind = kind;
        this.retryable = retryable;
    }

    public ProviderException(String provider, Kind kind, String message) {
        this(provider, kind, message, false);
    }

    public String provider() {
        return provider;
    }

    public Kind kind() {
        return kind;
    }

    public boolean isRetryable() {
        return retryable;
    }
}
