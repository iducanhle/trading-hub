package com.earningstracker.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import com.earningstracker.market.PriceBar;

/** Small shared helpers for the calculators. Percentages are in percent units: 3.25 means +3.25%. */
final class Percent {

    private Percent() {
    }

    /** {@code to / from - 1} in percent; null when {@code from} is not a positive price. */
    static Double change(double to, double from) {
        return from > 0 ? (to / from - 1) * 100 : null;
    }

    /** Close of the last bar dated on or before {@code date}; bars are oldest first. */
    static Optional<Double> closeOnOrBefore(List<PriceBar> bars, LocalDate date) {
        int index = lastIndexOnOrBefore(bars, date);
        return index < 0 ? Optional.empty() : Optional.of(bars.get(index).close());
    }

    static int lastIndexOnOrBefore(List<PriceBar> bars, LocalDate date) {
        int low = 0;
        int high = bars.size() - 1;
        int result = -1;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            if (bars.get(mid).date().isAfter(date)) {
                high = mid - 1;
            } else {
                result = mid;
                low = mid + 1;
            }
        }
        return result;
    }

    /** Index of the first bar dated on or after {@code date}, or -1. */
    static int firstIndexOnOrAfter(List<PriceBar> bars, LocalDate date) {
        int before = lastIndexOnOrBefore(bars, date.minusDays(1));
        int index = before + 1;
        return index < bars.size() ? index : -1;
    }
}
