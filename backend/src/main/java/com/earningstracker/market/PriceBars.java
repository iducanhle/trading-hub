package com.earningstracker.market;

import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.List;

public final class PriceBars {

    /** Providers publish the final daily bar a little after the close. */
    private static final Duration SETTLE_TIME = Duration.ofMinutes(30);

    private PriceBars() {
    }

    /**
     * Drops today's bar while its session may still be running: providers include the unfinished session in daily
     * series, and its values change until the close.
     */
    public static List<PriceBar> completedSessions(List<PriceBar> bars, Exchange session, Instant now) {
        if (bars.isEmpty()) {
            return bars;
        }
        ZonedDateTime local = now.atZone(session.zone());
        boolean todayUnfinished = !bars.getLast().date().isBefore(local.toLocalDate())
                && local.toLocalTime().isBefore(session.close().plus(SETTLE_TIME));
        return todayUnfinished ? bars.subList(0, bars.size() - 1) : bars;
    }
}
