package com.earningstracker.jobs;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import com.earningstracker.t212.T212Encryption;
import com.earningstracker.t212.T212Live;
import com.earningstracker.t212.T212LiveService;
import com.earningstracker.t212.T212SnapshotStore;
import com.earningstracker.t212.T212State;
import com.earningstracker.t212.T212StateStore;
import org.springframework.stereotype.Component;

/**
 * Every minute: stores each connected user's account value and cash ({@link T212SnapshotStore}) for the balance
 * history chart and for dating withdrawals (see {@code T212FlowTiming}). Reuses the live values the portfolio page shows (one account summary and one positions call when not
 * cached). A stale or missing value is skipped, never filled in, and a value equal to the user's last stored
 * one is not stored again (closed markets). Does nothing without {@code T212_ENCRYPTION_KEY}.
 */
@Component
public class T212SnapshotJob implements Job {

    public static final String NAME = "t212-snapshot";

    private final T212LiveService live;
    private final T212SnapshotStore snapshots;
    private final T212StateStore states;
    private final T212Encryption encryption;
    private final Clock clock;

    public T212SnapshotJob(T212LiveService live, T212SnapshotStore snapshots, T212StateStore states,
            T212Encryption encryption, Clock clock) {
        this.live = live;
        this.snapshots = snapshots;
        this.states = states;
        this.encryption = encryption;
        this.clock = clock;
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
        int stored = 0;
        int skipped = 0;
        int unchanged = 0;
        for (String uid : states.connectedUsers()) {
            Optional<T212State> state = states.find(uid);
            Optional<T212Live> values = state.isPresent() && state.get().credentialsValid()
                    ? live.live(uid) : Optional.empty();
            T212Live.Account account = values.filter(v -> !v.stale()).map(T212Live::account).orElse(null);
            Double value = account == null ? null : account.totalValue();
            if (value == null) {
                skipped++;
                continue;
            }
            Double cash = account.cash();
            if (snapshots.last(uid).filter(p -> p.value() == value && Objects.equals(p.cash(), cash)).isPresent()) {
                unchanged++;
                continue;
            }
            // Time of the job, not of a cached fetch, so points sit on the minute marks.
            snapshots.add(uid, new T212SnapshotStore.Point(Instant.now(clock), value, cash));
            stored++;
        }
        stats.put("stored", stored);
        stats.put("skipped", skipped);
        stats.put("unchanged", unchanged);
        return stats;
    }
}
