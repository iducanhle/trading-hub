package com.earningstracker.t212;

import java.time.Instant;

import com.google.cloud.Timestamp;

/** Firestore timestamps from and to {@link Instant}s. */
final class Timestamps {

    private Timestamps() {
    }

    static Timestamp of(Instant instant) {
        return instant == null ? null : Timestamp.ofTimeSecondsAndNanos(instant.getEpochSecond(), instant.getNano());
    }

    static Instant instant(Object value) {
        return value instanceof Timestamp ts ? Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()) : null;
    }
}
