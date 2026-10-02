package com.earningstracker.t212;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.provider.t212.T212Environment;
import org.springframework.stereotype.Component;

/** {@code t212/{uid}} state documents, cached in memory. */
@Component
public class T212StateStore {

    static final String COLLECTION = "t212";

    private final DocumentStore store;
    private final Map<String, Optional<T212State>> cache = new ConcurrentHashMap<>();

    public T212StateStore(DocumentStore store) {
        this.store = store;
    }

    public Optional<T212State> find(String uid) {
        return cache.computeIfAbsent(uid, id -> store.get(COLLECTION, id).map(T212StateStore::fromDocument));
    }

    public void save(String uid, T212State state) {
        store.set(COLLECTION, uid, toDocument(state));
        cache.put(uid, Optional.of(state));
    }

    /** All users with a state document (one read per user; used by the scheduled sync). */
    public List<String> connectedUsers() {
        return List.copyOf(store.list(COLLECTION).keySet());
    }

    /** Deletes the state document (the synced data is {@link T212DataStore}'s). */
    public void delete(String uid) {
        store.delete(COLLECTION, uid);
        cache.put(uid, Optional.empty());
    }

    private static Map<String, Object> toDocument(T212State state) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("environment", state.environment().name());
        doc.put("accountIdHash", state.accountIdHash());
        doc.put("accountCurrency", state.accountCurrency());
        doc.put("connectedAt", Timestamps.of(state.connectedAt()));
        doc.put("credentialsValid", state.credentialsValid());
        doc.put("syncState", state.syncState().name());
        doc.put("syncStartedAt", Timestamps.of(state.syncStartedAt()));
        doc.put("lastSyncAt", Timestamps.of(state.lastSyncAt()));
        doc.put("lastError", state.lastError() == null ? null
                : Map.of("code", state.lastError().code(), "message", state.lastError().message()));
        doc.put("completeHistories", List.copyOf(new java.util.TreeSet<>(state.completeHistories())));
        return doc;
    }

    private static T212State fromDocument(Map<String, Object> doc) {
        T212State.Error error = doc.get("lastError") instanceof Map<?, ?> map
                ? new T212State.Error(String.valueOf(map.get("code")), String.valueOf(map.get("message"))) : null;
        T212State.SyncState syncState;
        try {
            syncState = T212State.SyncState.valueOf(String.valueOf(doc.get("syncState")));
        } catch (IllegalArgumentException e) {
            syncState = T212State.SyncState.IDLE;
        }
        return new T212State("DEMO".equals(doc.get("environment")) ? T212Environment.DEMO : T212Environment.LIVE,
                (String) doc.get("accountIdHash"), (String) doc.get("accountCurrency"),
                Timestamps.instant(doc.get("connectedAt")), !Boolean.FALSE.equals(doc.get("credentialsValid")),
                syncState, Timestamps.instant(doc.get("syncStartedAt")), Timestamps.instant(doc.get("lastSyncAt")),
                error, doc.get("completeHistories") instanceof List<?> list
                        ? list.stream().map(String::valueOf).collect(java.util.stream.Collectors.toSet()) : Set.of());
    }
}
