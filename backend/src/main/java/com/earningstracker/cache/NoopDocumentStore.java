package com.earningstracker.cache;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

/** Used when Firebase is not configured (local development): nothing persists, caching stays in memory. */
public class NoopDocumentStore implements DocumentStore {

    @Override
    public Optional<Map<String, Object>> get(String collection, String id) {
        return Optional.empty();
    }

    @Override
    public Map<String, Map<String, Object>> getAll(String collection, Collection<String> ids) {
        return Map.of();
    }

    @Override
    public void set(String collection, String id, Map<String, Object> data) {
        // nothing to persist to
    }

    @Override
    public void merge(String collection, String id, Map<String, Object> fields) {
        // nothing to persist to
    }

    @Override
    public Map<String, Map<String, Object>> list(String collectionPath) {
        return Map.of();
    }

    @Override
    public boolean isPersistent() {
        return false;
    }

    @Override
    public Usage usage() {
        return new Usage(0, 0);
    }
}
