package com.earningstracker.cache;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
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

    /** Decides whether a cached value can be served without reloading. */
    @FunctionalInterface
    public interface Freshness<T> {
        boolean isFresh(T value, Instant fetchedAt, Instant now);
    }

    /**
     * @param name       L1 namespace and L2 collection
     * @param persistent also stored in L2; L1-only data (quotes, news) never touches Firestore
     * @param retainFor  how long L1 keeps a value, so a stale copy can still be served when providers fail
     */
    public record Policy<T>(String name, JavaType type, Freshness<T> freshness, boolean persistent, Duration retainFor,
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
        return policy(name, type, (value, fetchedAt, now) -> fetchedAt.plus(freshFor).isAfter(now), retainFor,
                persistent);
    }

    public <T> Policy<T> policy(String name, Class<T> type, Freshness<T> freshness, Duration retainFor,
            boolean persistent) {
        return policy(name, jsonMapper.constructType(type), freshness, retainFor, persistent);
    }

    public <T> Policy<T> policy(String name, JavaType type, Freshness<T> freshness, Duration retainFor,
            boolean persistent) {
        return new Policy<>(name, type, freshness, persistent, retainFor, 10_000);
    }

    public <T> Cached<T> get(Policy<T> policy, String id, Supplier<T> loader) {
        return refresh(policy, id, previous -> loader.get());
    }

    /**
     * Like {@link #get}, but the loader receives the cached value (possibly stale) or null, so it can update
     * incrementally (e.g. append new daily bars).
     */
    public <T> Cached<T> refresh(Policy<T> policy, String id, Function<T, T> loader) {
        Entry candidate = cachedEntry(policy, id);
        if (candidate != null && isFresh(policy, candidate)) {
            return cached(candidate, false);
        }
        try {
            T value = loader.apply(candidate == null ? null : this.<T>value(candidate));
            put(policy, id, value);
            return new Cached<>(value, clock.instant(), false);
        } catch (RuntimeException e) {
            if (candidate == null) {
                throw e;
            }
            log.info("Serving stale {}/{} from {}: {}", policy.name(), id, candidate.fetchedAt(), e.getMessage());
            return cached(candidate, true);
        }
    }

    /** The cached value from L1 or L2, fresh or not, without calling any provider. */
    public <T> Optional<Cached<T>> stored(Policy<T> policy, String id) {
        Entry entry = cachedEntry(policy, id);
        return entry == null ? Optional.empty() : Optional.of(cached(entry, !isFresh(policy, entry)));
    }

    /**
     * Cached values of several ids, fresh or not, without calling any provider: L1 hits, then one batched store
     * read for the rest (one read per id asked). Ids cached nowhere are absent from the result.
     */
    public <T> Map<String, T> storedAll(Policy<T> policy, Collection<String> ids) {
        Cache<String, Entry> l1 = l1(policy);
        Map<String, T> result = new LinkedHashMap<>();
        List<String> misses = new ArrayList<>();
        for (String id : ids) {
            Entry entry = l1.getIfPresent(id);
            if (entry != null) {
                result.put(id, value(entry));
            } else {
                misses.add(id);
            }
        }
        if (misses.isEmpty() || !policy.persistent()) {
            return result;
        }
        try {
            store.getAll(policy.name(), misses).forEach((id, doc) -> decode(policy, doc).ifPresent(entry -> {
                l1.put(id, entry);
                result.put(id, value(entry));
            }));
        } catch (RuntimeException e) {
            log.warn("Reading {} ids of {} from the document store failed; treating them as misses: {}",
                    misses.size(), policy.name(), e.getMessage());
        }
        return result;
    }

    /** The value in L1 only; never touches the store (cheap enough for every search result). */
    public <T> Optional<T> peek(Policy<T> policy, String id) {
        Entry entry = l1(policy).getIfPresent(id);
        return entry == null ? Optional.empty() : Optional.of(value(entry));
    }

    /** Stores a freshly fetched value in both levels (jobs use this to refresh proactively). */
    public <T> void put(Policy<T> policy, String id, T value) {
        put(policy, id, value, clock.instant());
    }

    /**
     * Stores a value with an explicit fetch time, e.g. data merged in without asking providers, which must not
     * look fresher than it is.
     */
    public <T> void put(Policy<T> policy, String id, T value, Instant fetchedAt) {
        Entry entry = new Entry(Objects.requireNonNull(value, () -> "no value to cache for " + policy.name() + "/" + id),
                fetchedAt);
        l1(policy).put(id, entry);
        if (policy.persistent()) {
            writeL2(policy, id, entry);
        }
    }

    private Entry cachedEntry(Policy<?> policy, String id) {
        Cache<String, Entry> l1 = l1(policy);
        Entry entry = l1.getIfPresent(id);
        if (entry == null && policy.persistent()) {
            entry = readL2(policy, id).orElse(null);
            if (entry != null) {
                l1.put(id, entry);
            }
        }
        return entry;
    }

    private <T> boolean isFresh(Policy<T> policy, Entry entry) {
        return policy.freshness().isFresh(value(entry), entry.fetchedAt(), clock.instant());
    }

    @SuppressWarnings("unchecked")
    private <T> T value(Entry entry) {
        return (T) entry.value();
    }

    private <T> Cached<T> cached(Entry entry, boolean stale) {
        return new Cached<>(value(entry), entry.fetchedAt(), stale);
    }

    private Cache<String, Entry> l1(Policy<?> policy) {
        return memory.computeIfAbsent(policy.name(), name -> Caffeine.newBuilder()
                .expireAfterWrite(policy.retainFor())
                .maximumSize(policy.maxEntries())
                .build());
    }

    private Optional<Entry> readL2(Policy<?> policy, String id) {
        try {
            return store.get(policy.name(), id).flatMap(doc -> decode(policy, doc));
        } catch (RuntimeException e) {
            log.warn("Reading {}/{} from the document store failed; treating it as a miss: {}", policy.name(), id,
                    e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<Entry> decode(Policy<?> policy, Map<String, Object> doc) {
        Object data = doc.get("data");
        Instant updatedAt = doc.get("updatedAt") instanceof Timestamp ts
                ? Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos())
                : null;
        if (data == null || updatedAt == null) {
            return Optional.empty();
        }
        return Optional.of(new Entry(jsonMapper.convertValue(data, policy.type()), updatedAt));
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
