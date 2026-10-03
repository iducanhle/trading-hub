package com.earningstracker.service;

import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;

/**
 * Bar size of {@code GET /api/stocks/{symbol}/prices}. The intraday ones come straight from the intraday provider
 * (Yahoo keeps 5- to 30-minute bars for about 60 days and hourly ones for about two years); weekly bars are built
 * from the stored daily bars.
 */
public enum BarInterval {
    M5("5m", Duration.ofMinutes(5)),
    M15("15m", Duration.ofMinutes(15)),
    M30("30m", Duration.ofMinutes(30)),
    H1("1h", Duration.ofHours(1)),
    D1("1d", Duration.ofDays(1)),
    W1("1wk", Duration.ofDays(7));

    private final String label;
    private final Duration length;

    BarInterval(String label, Duration length) {
        this.label = label;
        this.length = length;
    }

    public String label() {
        return label;
    }

    public Duration length() {
        return length;
    }

    public boolean intraday() {
        return length.compareTo(Duration.ofDays(1)) < 0;
    }

    public static Optional<BarInterval> parse(String label) {
        return Arrays.stream(values()).filter(i -> i.label.equalsIgnoreCase(label)).findFirst();
    }
}
