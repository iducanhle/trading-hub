package com.earningstracker.provider.http;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;

/** Calls allowed per UTC day (providers reset daily limits at midnight UTC); in memory, so a restart resets it. */
public final class DailyQuota {

    private final int limit;
    private final Clock clock;
    private LocalDate day;
    private int used;

    public DailyQuota(int limit, Clock clock) {
        this.limit = limit;
        this.clock = clock;
    }

    public synchronized boolean tryAcquire() {
        roll();
        if (used >= limit) {
            return false;
        }
        used++;
        return true;
    }

    public synchronized int used() {
        roll();
        return used;
    }

    public int limit() {
        return limit;
    }

    private void roll() {
        LocalDate today = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        if (!today.equals(day)) {
            day = today;
            used = 0;
        }
    }
}
