package com.earningstracker.t212;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.provider.t212.T212Credentials;
import com.earningstracker.provider.t212.T212Environment;
import org.springframework.stereotype.Component;

/**
 * Encrypted Trading 212 keys in the backend-only {@code t212Credentials/{uid}} documents. Only ciphertexts and
 * the key hint are stored and cached; plaintext exists only while a request or sync uses it.
 */
@Component
public class T212CredentialStore {

    static final String COLLECTION = "t212Credentials";

    /** What is stored, without anything decrypted. */
    public record StoredKey(T212Environment environment, String keyHint, String keyId, Instant createdAt,
            T212Crypto.Sealed apiKey, T212Crypto.Sealed apiSecret) {
    }

    private final DocumentStore store;
    private final T212Encryption encryption;
    private final Clock clock;
    /** Ciphertext documents by uid; an empty Optional means "known to have none". */
    private final Map<String, Optional<StoredKey>> cache = new ConcurrentHashMap<>();

    public T212CredentialStore(DocumentStore store, T212Encryption encryption, Clock clock) {
        this.store = store;
        this.encryption = encryption;
        this.clock = clock;
    }

    public Optional<StoredKey> find(String uid) {
        return cache.computeIfAbsent(uid, id -> store.get(COLLECTION, id).map(T212CredentialStore::fromDocument));
    }

    /**
     * The decrypted key.
     *
     * @throws T212Crypto.UnreadableException if it was stored with another master key or cannot be decrypted
     */
    public T212Credentials decrypt(String uid, StoredKey stored) {
        T212Crypto crypto = encryption.require();
        if (!crypto.keyId().equals(stored.keyId())) {
            throw new T212Crypto.UnreadableException();
        }
        String apiKey = crypto.open(stored.apiKey(), uid);
        String apiSecret = stored.apiSecret() == null ? null : crypto.open(stored.apiSecret(), uid);
        return new T212Credentials(apiKey, apiSecret, stored.environment());
    }

    public void save(String uid, T212Credentials credentials) {
        T212Crypto crypto = encryption.require();
        Instant now = clock.instant();
        Instant createdAt = find(uid).map(StoredKey::createdAt).orElse(now);
        StoredKey stored = new StoredKey(credentials.environment(), credentials.keyHint(), crypto.keyId(), createdAt,
                crypto.seal(credentials.apiKey(), uid),
                credentials.apiSecret() == null ? null : crypto.seal(credentials.apiSecret(), uid));
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("environment", stored.environment().name());
        doc.put("apiKey", sealed(stored.apiKey()));
        doc.put("apiSecret", stored.apiSecret() == null ? null : sealed(stored.apiSecret()));
        doc.put("keyHint", stored.keyHint());
        doc.put("keyId", stored.keyId());
        doc.put("createdAt", Timestamps.of(createdAt));
        doc.put("updatedAt", Timestamps.of(now));
        store.set(COLLECTION, uid, doc);
        cache.put(uid, Optional.of(stored));
    }

    public void delete(String uid) {
        cache.put(uid, Optional.empty());
        store.delete(COLLECTION, uid);
    }

    private static Map<String, Object> sealed(T212Crypto.Sealed value) {
        return Map.of("iv", value.iv(), "ciphertext", value.ciphertext());
    }

    @SuppressWarnings("unchecked")
    private static T212Crypto.Sealed sealed(Object value) {
        if (value instanceof Map<?, ?> map && map.get("iv") instanceof String iv
                && map.get("ciphertext") instanceof String ciphertext) {
            return new T212Crypto.Sealed(iv, ciphertext);
        }
        return null;
    }

    private static StoredKey fromDocument(Map<String, Object> doc) {
        T212Environment environment = "DEMO".equals(doc.get("environment")) ? T212Environment.DEMO
                : T212Environment.LIVE;
        T212Crypto.Sealed apiKey = sealed(doc.get("apiKey"));
        T212Crypto.Sealed apiSecret = sealed(doc.get("apiSecret"));
        return new StoredKey(environment, (String) doc.get("keyHint"), (String) doc.get("keyId"),
                Timestamps.instant(doc.get("createdAt")),
                apiKey == null ? new T212Crypto.Sealed("", "") : apiKey, apiSecret);
    }
}
