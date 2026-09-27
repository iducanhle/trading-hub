package com.earningstracker.provider;

import java.util.List;

import com.earningstracker.market.EarningsReport;

public interface EarningsProvider extends MarketDataProvider {

    /** Past and upcoming quarterly reports the provider knows for the symbol, in any order. */
    List<EarningsReport> earnings(String symbol);
}
