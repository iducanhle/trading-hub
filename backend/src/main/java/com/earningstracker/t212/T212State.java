package com.earningstracker.t212;

import java.time.Instant;
import java.util.Set;

import com.earningstracker.provider.t212.T212Environment;

/**
 * A connected user's Trading 212 state, stored in {@code t212/{uid}}.
 *
 * @param accountIdHash     SHA-256 of uid, environment and Trading 212 account id: a replacement key for another
 *                          account is detected without storing the account number
 * @param credentialsValid  false once Trading 212 rejected the stored key (or it cannot be decrypted)
 * @param completeHistories history types ({@code ORDERS}, {@code DIVIDENDS}, {@code TRANSACTIONS}) read to the end
 *                          at least once; until then a sync pages through everything instead of stopping early
 */
public record T212State(T212Environment environment, String accountIdHash, String accountCurrency,
        Instant connectedAt, boolean credentialsValid, SyncState syncState, Instant syncStartedAt, Instant lastSyncAt,
        Error lastError, Set<String> completeHistories) {

    public enum SyncState {
        IDLE, RUNNING, FAILED
    }

    public record Error(String code, String message) {
    }

    public T212State {
        completeHistories = completeHistories == null ? Set.of() : Set.copyOf(completeHistories);
    }

    public T212State withSync(SyncState state, Instant startedAt, Instant lastSync, Error error) {
        return new T212State(environment, accountIdHash, accountCurrency, connectedAt, credentialsValid, state,
                startedAt, lastSync, error, completeHistories);
    }

    public T212State withCredentialsValid(boolean valid) {
        return new T212State(environment, accountIdHash, accountCurrency, connectedAt, valid, syncState,
                syncStartedAt, lastSyncAt, lastError, completeHistories);
    }

    public T212State withCompleteHistories(Set<String> complete) {
        return new T212State(environment, accountIdHash, accountCurrency, connectedAt, credentialsValid, syncState,
                syncStartedAt, lastSyncAt, lastError, complete);
    }
}
