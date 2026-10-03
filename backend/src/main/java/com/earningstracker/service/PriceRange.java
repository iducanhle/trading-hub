package com.earningstracker.service;

import java.time.Period;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * Chart ranges of {@code GET /api/stocks/{symbol}/prices}, back from the latest bar. {@link #D1} is the latest
 * session. Each range allows a few bar intervals, the default first: small enough to be worth showing, and within
 * the provider's intraday history (about 60 days of 5- to 30-minute bars, two years of hourly ones).
 */
public enum PriceRange {
    D1("1D", Period.ZERO, BarInterval.M5, BarInterval.M15, BarInterval.M30, BarInterval.H1),
    W1("1W", Period.ofDays(7), BarInterval.D1, BarInterval.M5, BarInterval.M15, BarInterval.M30, BarInterval.H1),
    M1("1M", Period.ofMonths(1), BarInterval.D1, BarInterval.M15, BarInterval.M30, BarInterval.H1),
    M2("2M", Period.ofMonths(2), BarInterval.D1, BarInterval.H1, BarInterval.W1),
    M3("3M", Period.ofMonths(3), BarInterval.D1, BarInterval.H1, BarInterval.W1),
    M6("6M", Period.ofMonths(6), BarInterval.D1, BarInterval.H1, BarInterval.W1),
    Y1("1Y", Period.ofYears(1), BarInterval.D1, BarInterval.H1, BarInterval.W1),
    Y3("3Y", Period.ofYears(3), BarInterval.D1, BarInterval.W1),
    Y5("5Y", Period.ofYears(5), BarInterval.D1, BarInterval.W1);

    private final String label;
    private final Period span;
    private final List<BarInterval> intervals;

    PriceRange(String label, Period span, BarInterval... intervals) {
        this.label = label;
        this.span = span;
        this.intervals = List.of(intervals);
    }

    public String label() {
        return label;
    }

    public Period span() {
        return span;
    }

    public boolean intraday() {
        return this == D1;
    }

    /** The intervals this range allows, the default first. */
    public List<BarInterval> intervals() {
        return intervals;
    }

    public BarInterval defaultInterval() {
        return intervals.getFirst();
    }

    public static Optional<PriceRange> parse(String label) {
        return Arrays.stream(values()).filter(r -> r.label.equalsIgnoreCase(label)).findFirst();
    }
}
