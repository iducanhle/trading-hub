package com.earningstracker.provider;

import java.time.LocalDate;
import java.util.List;

import com.earningstracker.market.EarningsReport;

public interface EarningsCalendarProvider extends MarketDataProvider {

    /** Market-wide reports dated {@code from}..{@code to} (inclusive); callers keep the window small. */
    List<EarningsReport> calendar(LocalDate from, LocalDate to);
}
