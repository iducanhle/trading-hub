package com.earningstracker.service;

import java.time.Period;
import java.util.Arrays;
import java.util.Optional;

/**
 * Chart ranges of {@code GET /api/stocks/{symbol}/prices}, back from the latest bar. {@link #D1} is the latest
 * session in 5-minute bars; the others are daily bars.
 */
public enum PriceRange {
    D1("1D", Period.ZERO),
    W1("1W", Period.ofDays(7)),
    M1("1M", Period.ofMonths(1)),
    M2("2M", Period.ofMonths(2)),
    M3("3M", Period.ofMonths(3)),
    M6("6M", Period.ofMonths(6)),
    Y1("1Y", Period.ofYears(1)),
    Y3("3Y", Period.ofYears(3)),
    Y5("5Y", Period.ofYears(5));

    private final String label;
    private final Period span;

    PriceRange(String label, Period span) {
        this.label = label;
        this.span = span;
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

    public static Optional<PriceRange> parse(String label) {
        return Arrays.stream(values()).filter(r -> r.label.equalsIgnoreCase(label)).findFirst();
    }
}
