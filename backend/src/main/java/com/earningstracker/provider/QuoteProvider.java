package com.earningstracker.provider;

import com.earningstracker.market.Quote;

public interface QuoteProvider extends MarketDataProvider {

    Quote quote(String symbol);
}
