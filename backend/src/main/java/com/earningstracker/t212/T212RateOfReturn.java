package com.earningstracker.t212;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.function.DoubleUnaryOperator;

/**
 * The money-weighted rate of return (MWRR) Trading 212 shows as "Rate of return": the internal rate of return of the
 * deposits and withdrawals against the account value now, as one rate over the whole time since the first deposit
 * (not annualized). Older and larger deposits weigh more than recent or small ones.
 */
final class T212RateOfReturn {

    /** A deposit (positive) or withdrawal (negative), in the account currency. */
    record Flow(Instant at, double amount) {
    }

    private static final double LOWEST = -0.9999;
    private static final double HIGHEST = 1_000_000;

    private T212RateOfReturn() {
    }

    /**
     * The rate as a fraction (0.224 = 22.4 %), or null without deposits, without a positive value now, or when no
     * rate fits the flows.
     */
    static Double compute(List<Flow> flows, double valueNow, Instant now) {
        List<Flow> sorted = flows.stream().filter(f -> f.amount() != 0 && !f.at().isAfter(now))
                .sorted(Comparator.comparing(Flow::at)).toList();
        if (sorted.isEmpty() || valueNow <= 0) {
            return null;
        }
        double span = Duration.between(sorted.getFirst().at(), now).toMillis();
        if (span <= 0) {
            return null;
        }
        double[] amounts = new double[sorted.size()];
        double[] weights = new double[sorted.size()];
        for (int i = 0; i < sorted.size(); i++) {
            amounts[i] = sorted.get(i).amount();
            weights[i] = Duration.between(sorted.get(i).at(), now).toMillis() / span;
        }
        // Growing each flow by (1 + rate) for the share of the time it was in the account must give today's value.
        DoubleUnaryOperator gap = rate -> {
            double grown = 0;
            for (int i = 0; i < amounts.length; i++) {
                grown += amounts[i] * Math.pow(1 + rate, weights[i]);
            }
            return grown - valueNow;
        };
        double low = LOWEST;
        double high = 1;
        while (gap.applyAsDouble(high) < 0 && high < HIGHEST) {
            high *= 10;
        }
        if (gap.applyAsDouble(low) > 0 || gap.applyAsDouble(high) < 0) {
            return null;
        }
        for (int i = 0; i < 200 && high - low > 1e-10; i++) {
            double mid = (low + high) / 2;
            if (gap.applyAsDouble(mid) < 0) {
                low = mid;
            } else {
                high = mid;
            }
        }
        return (low + high) / 2;
    }
}
