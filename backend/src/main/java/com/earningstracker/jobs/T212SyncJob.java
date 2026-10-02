package com.earningstracker.jobs;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import com.earningstracker.t212.T212Encryption;
import com.earningstracker.t212.T212State;
import com.earningstracker.t212.T212StateStore;
import com.earningstracker.t212.T212SyncService;
import org.springframework.stereotype.Component;

/**
 * Every {@code app.t212.sync-interval} (6 h): an incremental Trading 212 sync for each connected user, one after
 * the other. Users whose key Trading 212 rejected are skipped until they replace it. Does nothing when
 * {@code T212_ENCRYPTION_KEY} is not set.
 */
@Component
public class T212SyncJob implements Job {

    public static final String NAME = "t212-sync";

    private final T212SyncService sync;
    private final T212StateStore states;
    private final T212Encryption encryption;

    public T212SyncJob(T212SyncService sync, T212StateStore states, T212Encryption encryption) {
        this.sync = sync;
        this.states = states;
        this.encryption = encryption;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public Map<String, Object> run() {
        Map<String, Object> stats = new LinkedHashMap<>();
        if (encryption.crypto().isEmpty()) {
            stats.put("skipped", "T212_ENCRYPTION_KEY is not set");
            return stats;
        }
        int users = 0;
        int synced = 0;
        int skipped = 0;
        int failed = 0;
        int newItems = 0;
        for (String uid : states.connectedUsers()) {
            users++;
            Optional<T212State> state = states.find(uid);
            if (state.isEmpty() || !state.get().credentialsValid()) {
                skipped++;
                continue;
            }
            Optional<T212SyncService.Result> result = sync.runNow(uid);
            if (result.isPresent()) {
                synced++;
                newItems += result.get().newFills() + result.get().newDividends() + result.get().newTransactions();
            } else {
                failed++; // already running, or failed (recorded in the user's state)
            }
        }
        stats.put("users", users);
        stats.put("synced", synced);
        stats.put("skipped", skipped);
        stats.put("notSynced", failed);
        stats.put("newItems", newItems);
        return stats;
    }
}
