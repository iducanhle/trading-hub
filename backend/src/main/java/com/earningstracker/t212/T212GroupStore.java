package com.earningstracker.t212;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.UnaryOperator;

import com.earningstracker.cache.DocumentStore;
import org.springframework.stereotype.Component;

/**
 * The user's groups in one backend-only document, {@code t212/{uid}/groups/all} ({@code {items: [...]}}), cached in
 * memory. {@link T212DataStore#deleteAll} deletes the document; {@link #forget} drops the cached copy.
 */
@Component
public class T212GroupStore {

    static final String GROUPS = "groups";
    private static final String DOC = "all";

    /** One group: its trades are fill ids ({@link T212Fill#id()}), in the order they were added. */
    public record Group(String id, String name, Instant createdAt, List<String> trades) {

        public Group {
            trades = List.copyOf(trades);
        }

        Group withName(String newName) {
            return new Group(id, newName, createdAt, trades);
        }

        Group withTrades(List<String> newTrades) {
            return new Group(id, name, createdAt, newTrades);
        }
    }

    private final DocumentStore store;
    private final Map<String, List<Group>> cache = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    public T212GroupStore(DocumentStore store) {
        this.store = store;
    }

    public List<Group> load(String uid) {
        return cache.computeIfAbsent(uid, this::read);
    }

    /** Fill id → group id of every assigned trade. */
    public Map<String, String> groupOf(String uid) {
        Map<String, String> result = new LinkedHashMap<>();
        for (Group group : load(uid)) {
            group.trades().forEach(trade -> result.put(trade, group.id()));
        }
        return result;
    }

    /**
     * Changes the groups under the user's lock: {@code change} gets the current list and returns the new one (or
     * throws to change nothing), which is then written.
     */
    public List<Group> update(String uid, UnaryOperator<List<Group>> change) {
        ReentrantLock lock = locks.computeIfAbsent(uid, id -> new ReentrantLock());
        lock.lock();
        try {
            List<Group> updated = List.copyOf(change.apply(load(uid)));
            store.set(path(uid), DOC, Map.of("items", updated.stream().map(T212GroupStore::toDoc).toList()));
            cache.put(uid, updated);
            return updated;
        } finally {
            lock.unlock();
        }
    }

    /** Forgets the cached copy (after {@link T212DataStore#deleteAll} removed the document). */
    public void forget(String uid) {
        cache.remove(uid);
    }

    private List<Group> read(String uid) {
        return store.get(path(uid), DOC)
                .map(doc -> doc.get("items") instanceof List<?> items ? items.stream()
                        .filter(Map.class::isInstance).map(item -> fromDoc((Map<?, ?>) item)).toList()
                        : List.<Group>of())
                .orElse(List.of());
    }

    private static String path(String uid) {
        return T212StateStore.COLLECTION + "/" + uid + "/" + GROUPS;
    }

    private static Map<String, Object> toDoc(Group group) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", group.id());
        doc.put("name", group.name());
        doc.put("createdAt", group.createdAt().toEpochMilli());
        doc.put("trades", group.trades());
        return doc;
    }

    private static Group fromDoc(Map<?, ?> doc) {
        List<String> trades = doc.get("trades") instanceof List<?> list
                ? list.stream().map(String::valueOf).toList() : List.of();
        Instant createdAt = doc.get("createdAt") instanceof Number n ? Instant.ofEpochMilli(n.longValue())
                : Instant.EPOCH;
        return new Group(String.valueOf(doc.get("id")), String.valueOf(doc.get("name")), createdAt, trades);
    }
}
