package com.earningstracker.cache;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

/**
 * Persistent key/value documents (Firestore in production). Every call may throw {@link DocumentStoreException};
 * callers treat that as a miss so the app keeps working on its in-memory cache.
 */
public interface DocumentStore {

    Optional<Map<String, Object>> get(String collection, String id);

    /** Documents that exist, keyed by id; each requested id costs one read. */
    Map<String, Map<String, Object>> getAll(String collection, Collection<String> ids);

    void set(String collection, String id, Map<String, Object> data);

    /** False for the no-op store used when Firebase is not configured. */
    boolean isPersistent();

    /** Reads and writes since startup, to log estimated Firestore usage (free tier: 50k reads, 20k writes/day). */
    Usage usage();

    record Usage(long reads, long writes) {

        public Usage minus(Usage earlier) {
            return new Usage(reads - earlier.reads, writes - earlier.writes);
        }
    }
}
