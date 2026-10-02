package com.earningstracker.t212;

import java.time.Instant;

import com.earningstracker.provider.t212.T212Environment;

/**
 * A connected user's Trading 212 state, stored in {@code t212/{uid}}.
 *
 * @param accountIdHash   SHA-256 of uid, environment and Trading 212 account id: a replacement key for another
 *                        account is detected without storing the account number
 * @param credentialsValid false once Trading 212 rejected the stored key (or it cannot be decrypted)
 */
public record T212State(T212Environment environment, String accountIdHash, String accountCurrency,
        Instant connectedAt, boolean credentialsValid, SyncState syncState, Instant syncStartedAt, Instant lastSyncAt,
        Error lastError) {

    public enum SyncState {
        IDLE, RUNNING, FAILED
    }

    public record Error(String code, String message) {
    }

    public T212State withSync(SyncState state, Instant startedAt, Instant lastSync, Error error) {
        return new T212State(environment, accountIdHash, accountCurrency, connectedAt, credentialsValid, state,
                startedAt, lastSync, error);
    }

    public T212State withCredentialsValid(boolean valid) {
        return new T212State(environment, accountIdHash, accountCurrency, connectedAt, valid, syncState,
                syncStartedAt, lastSyncAt, lastError);
    }
}
