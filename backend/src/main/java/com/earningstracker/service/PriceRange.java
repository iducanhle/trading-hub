package com.earningstracker.service;

import java.time.Period;
import java.util.Arrays;
import java.util.Optional;

/** Chart ranges of {@code GET /api/stocks/{symbol}/prices}, back from the latest bar. */
public enum PriceRange {
    W1("1W", Period.ofDays(7)),
    M1("1M", Period.ofMonths(1)),
    M6("6M", Period.ofMonths(6)),
    Y1("1Y", Period.ofYears(1)),
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

    public static Optional<PriceRange> parse(String label) {
        return Arrays.stream(values()).filter(r -> r.label.equalsIgnoreCase(label)).findFirst();
    }
}
