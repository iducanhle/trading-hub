package com.earningstracker.provider;

import java.time.Duration;
import java.time.Period;
import java.util.List;

import com.earningstracker.market.IntradayBar;

public interface IntradayProvider extends MarketDataProvider {

    /**
     * Bars of {@code interval} (5, 15 or 30 minutes, or an hour), oldest first: the latest session (the running one
     * while the exchange is open) when {@code lookback} is zero, otherwise at least the last {@code lookback}.
     */
    List<IntradayBar> intradayBars(String symbol, Duration interval, Period lookback);
}
