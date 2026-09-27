package com.earningstracker.cache;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;

import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;

/** Firestore via the Admin SDK (bypasses security rules); blocking calls with a timeout. */
public class FirestoreDocumentStore implements DocumentStore {

    private static final long TIMEOUT_SECONDS = 10;

    private final Firestore firestore;
    private final AtomicLong reads = new AtomicLong();
    private final AtomicLong writes = new AtomicLong();

    public FirestoreDocumentStore(Firestore firestore) {
        this.firestore = firestore;
    }

    @Override
    public Optional<Map<String, Object>> get(String collection, String id) {
        reads.incrementAndGet();
        DocumentSnapshot snapshot = await(firestore.collection(collection).document(id).get(), collection, id);
        return snapshot.exists() ? Optional.ofNullable(snapshot.getData()) : Optional.empty();
    }

    @Override
    public Map<String, Map<String, Object>> getAll(String collection, Collection<String> ids) {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        reads.addAndGet(ids.size());
        DocumentReference[] refs = ids.stream().map(id -> firestore.collection(collection).document(id))
                .toArray(DocumentReference[]::new);
        for (DocumentSnapshot snapshot : await(firestore.getAll(refs), collection, ids.size() + " ids")) {
            if (snapshot.exists() && snapshot.getData() != null) {
                result.put(snapshot.getId(), snapshot.getData());
            }
        }
        return result;
    }

    @Override
    public void set(String collection, String id, Map<String, Object> data) {
        writes.incrementAndGet();
        await(firestore.collection(collection).document(id).set(data), collection, id);
    }

    @Override
    public boolean isPersistent() {
        return true;
    }

    @Override
    public Usage usage() {
        return new Usage(reads.get(), writes.get());
    }

    private static <T> T await(ApiFuture<T> future, String collection, String id) {
        try {
            return future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DocumentStoreException("Interrupted accessing " + collection + "/" + id, e);
        } catch (ExecutionException | TimeoutException e) {
            throw new DocumentStoreException("Firestore failed on " + collection + "/" + id, e);
        }
    }
}
