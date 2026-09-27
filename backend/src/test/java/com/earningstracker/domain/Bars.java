package com.earningstracker.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.earningstracker.market.PriceBar;

/** Test bars on every weekday; bar i has open = 100 + i - 0.5, close = 100 + i, volume = 1000 + i. */
final class Bars {

    private Bars() {
    }

    static List<PriceBar> weekdays(String from, String to) {
        List<PriceBar> bars = new ArrayList<>();
        int i = 0;
        for (LocalDate d = LocalDate.parse(from); !d.isAfter(LocalDate.parse(to)); d = d.plusDays(1)) {
            if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
                bars.add(new PriceBar(d, 100 + i - 0.5, 100 + i + 1, 100 + i - 1, 100 + i, 1000 + i));
                i++;
            }
        }
        return bars;
    }

    static PriceBar on(List<PriceBar> bars, String date) {
        return bars.stream().filter(b -> b.date().equals(LocalDate.parse(date))).findFirst().orElseThrow();
    }

    static double pct(double to, double from) {
        return (to / from - 1) * 100;
    }
}
