package com.earningstracker.provider;

import java.util.List;

import com.earningstracker.market.Region;
import com.earningstracker.market.SymbolMatch;

public interface SymbolSearchProvider extends MarketDataProvider {

    /** Equities on supported exchanges of {@code region}, best match first. */
    List<SymbolMatch> search(String query, Region region, int limit);
}
