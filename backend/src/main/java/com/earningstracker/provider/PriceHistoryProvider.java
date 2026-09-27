package com.earningstracker.provider;

import java.time.LocalDate;
import java.util.List;

import com.earningstracker.market.PriceBar;

public interface PriceHistoryProvider extends MarketDataProvider {

    /** Completed daily sessions from {@code from} (inclusive) to the latest close, oldest first. */
    List<PriceBar> dailyBars(String symbol, LocalDate from);
}
