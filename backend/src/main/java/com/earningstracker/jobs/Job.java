package com.earningstracker.jobs;

import java.time.ZoneId;
import java.util.Map;

/** A scheduled, idempotent job: rerunning it after an interruption continues where it stopped. */
public interface Job {

    ZoneId ZONE = ZoneId.of("Europe/Prague");

    /**
     * {@code calendar-refresh}, {@code market-events-refresh}, {@code eu-universe-refresh}, {@code prices-refresh},
     * {@code earnings-digest}, {@code t212-sync} or {@code t212-snapshot}.
     */
    String name();

    /** Does the work and returns counters for {@code jobRuns/{name}.stats}. */
    Map<String, Object> run();
}
