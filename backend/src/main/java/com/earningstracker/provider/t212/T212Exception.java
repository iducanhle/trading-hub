package com.earningstracker.provider.t212;

import java.time.Instant;

/** A failed Trading 212 call. Messages never contain keys, secrets or headers. */
public class T212Exception extends RuntimeException {

    public enum Kind {
        /** 401: the key is wrong or revoked. */
        UNAUTHORIZED,
        /** 403: the key lacks the permission (scope) for this endpoint. */
        FORBIDDEN,
        /** 429 after waiting and retrying, or a wait that would exceed the configured maximum. */
        RATE_LIMITED,
        /** 408, 5xx, timeouts and I/O errors. */
        UNAVAILABLE,
        /** Any other status, or a body that cannot be read. */
        BAD_RESPONSE
    }

    private final Kind kind;
    private final int status;
    private final Instant retryAt;

    public T212Exception(Kind kind, int status, String message, Instant retryAt) {
        super(message);
        this.kind = kind;
        this.status = status;
        this.retryAt = retryAt;
    }

    public T212Exception(Kind kind, String message) {
        this(kind, 0, message, null);
    }

    public Kind kind() {
        return kind;
    }

    /** HTTP status, or 0 when there was no response. */
    public int status() {
        return status;
    }

    /** For {@link Kind#RATE_LIMITED}: when Trading 212 resets the limit, if it said so. */
    public Instant retryAt() {
        return retryAt;
    }
}
