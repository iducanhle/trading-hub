package com.earningstracker.t212;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

import com.earningstracker.provider.t212.T212Client;
import com.earningstracker.provider.t212.T212Client.History;
import com.earningstracker.provider.t212.T212Credentials;
import com.earningstracker.provider.t212.T212Exception;
import com.earningstracker.provider.t212.T212Exception.Kind;
import com.earningstracker.web.dto.T212Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/** Connecting, checking and disconnecting a user's Trading 212 account. */
@Service
public class T212ConnectionService {

    /** Raised when the key cannot be used; the state already records why. */
    public static final String UNREADABLE_MESSAGE = "The stored Trading 212 key cannot be read (the server's "
            + "encryption key changed). Connect again.";

    private static final Logger log = LoggerFactory.getLogger(T212ConnectionService.class);
    private static final int MAX_FIELD_LENGTH = 200;

    private final T212Client client;
    private final T212CredentialStore credentials;
    private final T212StateStore states;
    private final T212Encryption encryption;
    private final T212Properties properties;
    private final Clock clock;
    private final ConcurrentHashMap<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    public T212ConnectionService(T212Client client, T212CredentialStore credentials, T212StateStore states,
            T212Encryption encryption, T212Properties properties, Clock clock) {
        this.client = client;
        this.credentials = credentials;
        this.states = states;
        this.encryption = encryption;
        this.properties = properties;
        this.clock = clock;
    }

    public T212Dtos.Status status(String uid) {
        T212Crypto crypto = encryption.require();
        Optional<T212CredentialStore.StoredKey> key = credentials.find(uid);
        Optional<T212State> state = states.find(uid);
        String serverIpHint = blankToNull(properties.serverIpHint());
        if (key.isEmpty() || state.isEmpty()) {
            return new T212Dtos.Status(false, null, null, null, null, null, T212State.SyncState.IDLE.name(), null,
                    null, null, serverIpHint);
        }
        T212State s = state.get();
        boolean readable = crypto.keyId().equals(key.get().keyId());
        T212State.Error error = readable ? s.lastError()
                : new T212State.Error(ErrorCode.T212_INVALID_CREDENTIALS.name(), UNREADABLE_MESSAGE);
        T212State.SyncState syncState = readable ? s.syncState() : T212State.SyncState.FAILED;
        return new T212Dtos.Status(true, key.get().environment(), blankToNull(key.get().keyHint()),
                s.accountCurrency(), readable && s.credentialsValid(), s.connectedAt(), syncState.name(),
                s.syncStartedAt(), s.lastSyncAt(),
                error == null ? null : new T212Dtos.Error(error.code(), error.message()), serverIpHint);
    }

    /**
     * Checks the key with Trading 212, then stores it. A key for a different account (or environment) than the
     * stored one deletes the synced data first.
     */
    public T212Dtos.Status connect(String uid, T212Dtos.CredentialsRequest request) {
        encryption.require();
        T212Credentials key = validate(request);
        Account account = probe(key);
        String accountIdHash = sha256(uid + "|" + key.environment() + "|" + account.id());

        ReentrantLock lock = lock(uid);
        lock.lock();
        try {
            Instant now = clock.instant();
            Optional<T212State> existing = states.find(uid);
            boolean sameAccount = existing.map(s -> accountIdHash.equals(s.accountIdHash())).orElse(false);
            if (existing.isPresent() && !sameAccount) {
                log.info("Trading 212 key for a different account: deleting the synced data of {}", uid);
                states.deleteData(uid);
            }
            credentials.save(uid, key);
            T212State state = new T212State(key.environment(), accountIdHash, account.currency(),
                    sameAccount ? existing.get().connectedAt() : now, true, T212State.SyncState.IDLE,
                    sameAccount ? existing.get().syncStartedAt() : null,
                    sameAccount ? existing.get().lastSyncAt() : null, null);
            states.save(uid, state);
            log.info("Trading 212 connected for {} ({}, {})", uid, key.environment(), account.currency());
        } finally {
            lock.unlock();
        }
        return status(uid);
    }

    /** Deletes the key and every synced document. Idempotent. */
    public void disconnect(String uid) {
        encryption.require();
        ReentrantLock lock = lock(uid);
        lock.lock();
        try {
            credentials.delete(uid);
            states.deleteAll(uid);
            log.info("Trading 212 disconnected for {}", uid);
        } finally {
            lock.unlock();
        }
    }

    /**
     * The caller's decrypted key, or 409 {@code T212_NOT_CONNECTED}. A key that cannot be decrypted marks the
     * credentials invalid and answers 400 {@code T212_INVALID_CREDENTIALS}.
     */
    public T212Credentials requireCredentials(String uid) {
        encryption.require();
        T212CredentialStore.StoredKey stored = credentials.find(uid)
                .orElseThrow(() -> new ApiException(ErrorCode.T212_NOT_CONNECTED, "Trading 212 is not connected"));
        try {
            return credentials.decrypt(uid, stored);
        } catch (T212Crypto.UnreadableException e) {
            log.warn("Trading 212 key of {} cannot be decrypted: {}", uid, e.getMessage());
            markInvalid(uid, UNREADABLE_MESSAGE);
            throw new ApiException(ErrorCode.T212_INVALID_CREDENTIALS, UNREADABLE_MESSAGE);
        }
    }

    /** After Trading 212 rejected the stored key (401/403 outside of connecting). */
    public void markInvalid(String uid, String message) {
        states.find(uid).ifPresent(state -> states.save(uid, state.withCredentialsValid(false)
                .withSync(T212State.SyncState.FAILED, state.syncStartedAt(), state.lastSyncAt(),
                        new T212State.Error(ErrorCode.T212_INVALID_CREDENTIALS.name(), message))));
    }

    ReentrantLock lock(String uid) {
        return locks.computeIfAbsent(uid, id -> new ReentrantLock());
    }

    private record Account(long id, String currency) {
    }

    private static T212Credentials validate(T212Dtos.CredentialsRequest request) {
        if (request == null) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "body is required");
        }
        String apiKey = request.apiKey() == null ? "" : request.apiKey().strip();
        String apiSecret = request.apiSecret() == null ? null : request.apiSecret().strip();
        if (apiKey.isEmpty() || apiKey.length() > MAX_FIELD_LENGTH) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "apiKey must be 1–" + MAX_FIELD_LENGTH + " characters");
        }
        if (apiSecret != null && apiSecret.length() > MAX_FIELD_LENGTH) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "apiSecret must be at most " + MAX_FIELD_LENGTH
                    + " characters");
        }
        if (request.environment() == null) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "environment must be LIVE or DEMO");
        }
        if (containsControl(apiKey) || (apiSecret != null && containsControl(apiSecret))) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "the key and secret must not contain control characters");
        }
        return new T212Credentials(apiKey, apiSecret, request.environment());
    }

    /** One call per permission the app needs; collects every missing one before failing. */
    private Account probe(T212Credentials key) {
        List<String> missing = new ArrayList<>();
        JsonNode summary = check(() -> client.accountSummary(key), "account", missing);
        check(() -> client.positions(key), "portfolio", missing);
        check(() -> client.historyPage(key, History.ORDERS.firstPage(1)), "history:orders", missing);
        check(() -> client.historyPage(key, History.DIVIDENDS.firstPage(1)), "history:dividends", missing);
        check(() -> client.historyPage(key, History.TRANSACTIONS.firstPage(1)), "history:transactions", missing);
        if (!missing.isEmpty()) {
            throw new ApiException(ErrorCode.T212_MISSING_PERMISSIONS,
                    "The API key is missing these permissions: " + String.join(", ", missing)
                            + ". Generate a key with them in the Trading 212 app.");
        }
        JsonNode id = summary.path("id");
        JsonNode currency = summary.path("currency");
        if (!id.isNumber() || !currency.isString() || currency.stringValue().isBlank()) {
            throw new ApiException(ErrorCode.T212_UNAVAILABLE, "Trading 212 sent an unexpected account summary");
        }
        return new Account(id.longValue(), currency.stringValue().strip().toUpperCase());
    }

    private static <T> T check(java.util.function.Supplier<T> call, String permission, List<String> missing) {
        try {
            return call.get();
        } catch (T212Exception e) {
            if (e.kind() == Kind.FORBIDDEN) {
                missing.add(permission);
                return null;
            }
            throw T212Errors.toApi(e);
        }
    }

    private static boolean containsControl(String value) {
        return value.chars().anyMatch(Character::isISOControl);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    static String sha256(String value) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
