package com.earningstracker.jobs;

import java.time.ZoneId;
import java.util.Map;

/** A scheduled, idempotent job: rerunning it after an interruption continues where it stopped. */
public interface Job {

    ZoneId ZONE = ZoneId.of("Europe/Prague");

    /** {@code calendar-refresh}, {@code eu-universe-refresh}, {@code prices-refresh} or {@code earnings-digest}. */
    String name();

    /** Does the work and returns counters for {@code jobRuns/{name}.stats}. */
    Map<String, Object> run();
}
