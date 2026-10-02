package com.earningstracker.provider;

import java.util.List;

import com.earningstracker.market.IntradayBar;

public interface IntradayProvider extends MarketDataProvider {

    /** 5-minute bars of the latest session (the running one while the exchange is open), oldest first. */
    List<IntradayBar> intradayBars(String symbol);
}
