package com.earningstracker.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Earnings result and surprise (§5). */
public final class EarningsMath {

    private EarningsMath() {
    }

    /** EPS actual vs estimate, both rounded to 2 decimals; null if either is missing. */
    public static EarningsResult result(Double estimate, Double actual) {
        if (estimate == null || actual == null) {
            return null;
        }
        int comparison = round2(actual).compareTo(round2(estimate));
        return comparison > 0 ? EarningsResult.BEAT : comparison < 0 ? EarningsResult.MISS : EarningsResult.INLINE;
    }

    /** (actual − estimate) / |estimate| × 100; null if the estimate is 0 or either value is missing. */
    public static Double surprisePercent(Double estimate, Double actual) {
        if (estimate == null || actual == null || estimate == 0) {
            return null;
        }
        return (actual - estimate) / Math.abs(estimate) * 100;
    }

    private static BigDecimal round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }
}
