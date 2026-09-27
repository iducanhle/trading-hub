package com.earningstracker.domain;

import java.time.LocalDate;
import java.util.List;

import com.earningstracker.market.PriceBar;

/**
 * Performance summary (§5): the latest value is the live price when it is newer than the last daily bar.
 * <ul>
 * <li>{@code w1}: vs the close 5 trading days earlier;</li>
 * <li>{@code m1}: vs the last close on or before the same calendar day one month earlier;</li>
 * <li>{@code ytd}: vs the last close of the previous year;</li>
 * <li>{@code y1}: vs the last close on or before the same date one year earlier.</li>
 * </ul>
 */
public final class PerformanceCalculator {

    public record Performance(Double w1, Double m1, Double ytd, Double y1) {

        public static final Performance EMPTY = new Performance(null, null, null, null);
    }

    private PerformanceCalculator() {
    }

    /** @param bars completed daily sessions, oldest first; @param live latest quote, or null */
    public static Performance summary(List<PriceBar> bars, LivePrice live) {
        boolean useLive = live != null && (bars.isEmpty() || live.date().isAfter(bars.getLast().date()));
        if (bars.isEmpty()) {
            return Performance.EMPTY;
        }
        double latest = useLive ? live.price() : bars.getLast().close();
        LocalDate latestDate = useLive ? live.date() : bars.getLast().date();
        int latestIndex = useLive ? bars.size() : bars.size() - 1;

        Double w1 = latestIndex >= 5 ? Percent.change(latest, bars.get(latestIndex - 5).close()) : null;
        return new Performance(w1,
                vs(latest, bars, latestDate.minusMonths(1)),
                vs(latest, bars, LocalDate.of(latestDate.getYear() - 1, 12, 31)),
                vs(latest, bars, latestDate.minusYears(1)));
    }

    private static Double vs(double latest, List<PriceBar> bars, LocalDate date) {
        return Percent.closeOnOrBefore(bars, date).map(close -> Percent.change(latest, close)).orElse(null);
    }
}
