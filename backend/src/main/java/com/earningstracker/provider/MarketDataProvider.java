package com.earningstracker.provider;

/** Base of every provider capability interface; one adapter class may implement several capabilities. */
public interface MarketDataProvider {

    /** Id used in the fallback chains of {@code app.providers.chains}: finnhub, twelvedata, yahoo, fmp. */
    String id();

    /** False when the provider is not configured (e.g. missing API key); the router then skips it. */
    default boolean isEnabled() {
        return true;
    }
}
