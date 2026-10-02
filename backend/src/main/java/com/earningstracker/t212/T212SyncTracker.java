package com.earningstracker.t212;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.stereotype.Component;

/** Which users have a sync running in this process, and a cancel flag per run (one run per user). */
@Component
public class T212SyncTracker {

    public record Run(Instant startedAt, AtomicBoolean cancelled) {
    }

    private final Map<String, Run> running = new ConcurrentHashMap<>();

    /** Registers a run, or returns empty if one is already running for the user. */
    public Optional<Run> begin(String uid, Instant startedAt) {
        Run run = new Run(startedAt, new AtomicBoolean());
        return running.putIfAbsent(uid, run) == null ? Optional.of(run) : Optional.empty();
    }

    public void end(String uid, Run run) {
        running.remove(uid, run);
    }

    public Optional<Run> current(String uid) {
        return Optional.ofNullable(running.get(uid));
    }

    /** Asks a running sync to stop at its next page; it then saves nothing. */
    public void cancel(String uid) {
        Run run = running.get(uid);
        if (run != null) {
            run.cancelled().set(true);
        }
    }
}
