package com.earningstracker.provider;

import java.util.Collection;
import java.util.List;

import com.earningstracker.market.SymbolMatch;

public interface ListingProvider extends MarketDataProvider {

    /** Name, exchange and currency of symbols listed on supported exchanges; others are left out. */
    List<SymbolMatch> listings(Collection<String> symbols);
}
