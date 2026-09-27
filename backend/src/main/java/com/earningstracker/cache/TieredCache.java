package com.earningstracker.cache;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.google.cloud.Timestamp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.json.JsonMapper;

/**
 * Two-level cache: L1 in memory (Caffeine), L2 in the {@link DocumentStore} (Firestore) for persistent policies.
 * On a miss or stale entry the loader runs; if it fails and any cached value exists, that value is served with
 * {@code stale = true} instead of an error. L2 documents are {@code {data, updatedAt}} under the policy's name.
 */
@Component
public class TieredCache {

    /**
     * @param name       L1 namespace and L2 collection
     * @param freshFor   age after which a value is reloaded
     * @param persistent also stored in L2; L1-only data (quotes, news) never touches Firestore
     * @param retainFor  how long L1 keeps a value, so a stale copy can still be served when providers fail
     */
    public record Policy<T>(String name, JavaType type, Duration freshFor, boolean persistent, Duration retainFor,
            long maxEntries) {
    }

    public record Cached<T>(T value, Instant fetchedAt, boolean stale) {
    }

    private record Entry(Object value, Instant fetchedAt) {
    }

    private static final Logger log = LoggerFactory.getLogger(TieredCache.class);
    private static final Duration MIN_RETENTION = Duration.ofDays(1);

    private final DocumentStore store;
    private final JsonMapper jsonMapper;
    private final Clock clock;
    private final Map<String, Cache<String, Entry>> memory = new ConcurrentHashMap<>();

    public TieredCache(DocumentStore store, JsonMapper jsonMapper, Clock clock) {
        this.store = store;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    public <T> Policy<T> policy(String name, Class<T> type, Duration freshFor, boolean persistent) {
        return policy(name, jsonMapper.constructType(type), freshFor, persistent);
    }

    public <T> Policy<T> policy(String name, JavaType type, Duration freshFor, boolean persistent) {
        Duration retainFor = freshFor.compareTo(MIN_RETENTION) > 0 ? freshFor.multipliedBy(2) : MIN_RETENTION;
        return new Policy<>(name, type, freshFor, persistent, retainFor, 10_000);
    }

    public <T> Cached<T> get(Policy<T> policy, String id, Supplier<T> loader) {
        Cache<String, Entry> l1 = l1(policy);
        Instant now = clock.instant();
        Entry candidate = l1.getIfPresent(id);
        if (candidate == null && policy.persistent()) {
            candidate = readL2(policy, id).orElse(null);
            if (candidate != null) {
                l1.put(id, candidate);
            }
        }
        if (candidate != null && isFresh(candidate, policy, now)) {
            return cached(candidate, false);
        }
        try {
            T value = loader.get();
            put(policy, id, value);
            return new Cached<>(value, now, false);
        } catch (RuntimeException e) {
            if (candidate == null) {
                throw e;
            }
            log.info("Serving stale {}/{} from {}: {}", policy.name(), id, candidate.fetchedAt(), e.getMessage());
            return cached(candidate, true);
        }
    }

    /** Stores a freshly fetched value in both levels (jobs use this to refresh proactively). */
    public <T> void put(Policy<T> policy, String id, T value) {
        Entry entry = new Entry(Objects.requireNonNull(value, () -> "no value to cache for " + policy.name() + "/" + id),
                clock.instant());
        l1(policy).put(id, entry);
        if (policy.persistent()) {
            writeL2(policy, id, entry);
        }
    }

    private boolean isFresh(Entry entry, Policy<?> policy, Instant now) {
        return entry.fetchedAt().plus(policy.freshFor()).isAfter(now);
    }

    @SuppressWarnings("unchecked")
    private static <T> Cached<T> cached(Entry entry, boolean stale) {
        return new Cached<>((T) entry.value(), entry.fetchedAt(), stale);
    }

    private Cache<String, Entry> l1(Policy<?> policy) {
        return memory.computeIfAbsent(policy.name(), name -> Caffeine.newBuilder()
                .expireAfterWrite(policy.retainFor())
                .maximumSize(policy.maxEntries())
                .build());
    }

    private Optional<Entry> readL2(Policy<?> policy, String id) {
        try {
            return store.get(policy.name(), id).flatMap(doc -> {
                Object data = doc.get("data");
                Instant updatedAt = doc.get("updatedAt") instanceof Timestamp ts
                        ? Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos())
                        : null;
                if (data == null || updatedAt == null) {
                    return Optional.empty();
                }
                return Optional.of(new Entry(jsonMapper.convertValue(data, policy.type()), updatedAt));
            });
        } catch (RuntimeException e) {
            log.warn("Reading {}/{} from the document store failed; treating it as a miss: {}", policy.name(), id,
                    e.getMessage());
            return Optional.empty();
        }
    }

    private void writeL2(Policy<?> policy, String id, Entry entry) {
        try {
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("data", jsonMapper.convertValue(entry.value(), Object.class));
            doc.put("updatedAt", Timestamp.ofTimeSecondsAndNanos(entry.fetchedAt().getEpochSecond(),
                    entry.fetchedAt().getNano()));
            store.set(policy.name(), id, doc);
        } catch (RuntimeException e) {
            log.warn("Writing {}/{} to the document store failed; keeping it in memory only: {}", policy.name(), id,
                    e.getMessage());
        }
    }
}
