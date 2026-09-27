package com.earningstracker.provider;

import java.util.List;

public interface PeersProvider extends MarketDataProvider {

    /** Canonical symbols of similar companies on supported exchanges, excluding the symbol itself. */
    List<String> peers(String symbol);
}
