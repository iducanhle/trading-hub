package com.earningstracker.web.dto;

import java.time.Instant;

import com.earningstracker.provider.t212.T212Environment;

/** Trading 212 response and request bodies, named as in docs/CONTRACT.md. */
public final class T212Dtos {

    private T212Dtos() {
    }

    public record Error(String code, String message) {
    }

    public record Status(boolean connected, T212Environment environment, String keyHint, String accountCurrency,
            Boolean credentialsValid, Instant connectedAt, String syncState, Instant syncStartedAt,
            Instant lastSyncAt, Error lastError, String serverIpHint) {
    }

    /** {@code PUT /api/t212/credentials}. {@link #toString()} hides the key and secret. */
    public record CredentialsRequest(String apiKey, String apiSecret, T212Environment environment) {

        @Override
        public String toString() {
            return "CredentialsRequest[environment=" + environment + "]";
        }
    }
}
