package com.earningstracker.cache;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Test double for Firestore; can be told to fail. */
public class InMemoryDocumentStore implements DocumentStore {

    private final Map<String, Map<String, Object>> documents = new ConcurrentHashMap<>();
    private final AtomicLong reads = new AtomicLong();
    private final AtomicLong writes = new AtomicLong();
    private volatile boolean failing;

    public void failing(boolean failing) {
        this.failing = failing;
    }

    public Optional<Map<String, Object>> peek(String collection, String id) {
        return Optional.ofNullable(documents.get(collection + "/" + id));
    }

    @Override
    public Optional<Map<String, Object>> get(String collection, String id) {
        check();
        reads.incrementAndGet();
        return peek(collection, id);
    }

    @Override
    public Map<String, Map<String, Object>> getAll(String collection, Collection<String> ids) {
        check();
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        for (String id : ids) {
            reads.incrementAndGet();
            peek(collection, id).ifPresent(doc -> result.put(id, doc));
        }
        return result;
    }

    @Override
    public void set(String collection, String id, Map<String, Object> data) {
        check();
        writes.incrementAndGet();
        documents.put(collection + "/" + id, java.util.Collections.unmodifiableMap(new LinkedHashMap<>(data)));
    }

    @Override
    public void merge(String collection, String id, Map<String, Object> fields) {
        check();
        writes.incrementAndGet();
        Map<String, Object> merged = new LinkedHashMap<>(peek(collection, id).orElse(Map.of()));
        merged.putAll(fields);
        documents.put(collection + "/" + id, java.util.Collections.unmodifiableMap(merged));
    }

    @Override
    public Map<String, Map<String, Object>> list(String collectionPath) {
        check();
        String prefix = collectionPath + "/";
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        documents.forEach((key, doc) -> {
            if (key.startsWith(prefix) && key.indexOf('/', prefix.length()) < 0) {
                result.put(key.substring(prefix.length()), doc);
            }
        });
        reads.addAndGet(Math.max(1, result.size()));
        return result;
    }

    @Override
    public boolean isPersistent() {
        return true;
    }

    @Override
    public Usage usage() {
        return new Usage(reads.get(), writes.get());
    }

    private void check() {
        if (failing) {
            throw new DocumentStoreException("store is down", null);
        }
    }
}
