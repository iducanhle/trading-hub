package com.earningstracker.provider;

/** Capabilities routed through {@code app.providers.chains}; keys there use the lower-case, dashed names. */
public enum Capability {
    SEARCH(SymbolSearchProvider.class),
    QUOTE(QuoteProvider.class),
    PROFILE(ProfileProvider.class),
    PRICE_HISTORY(PriceHistoryProvider.class),
    EARNINGS(EarningsProvider.class),
    EARNINGS_CALENDAR(EarningsCalendarProvider.class),
    RECOMMENDATIONS(RecommendationProvider.class),
    NEWS(NewsProvider.class),
    PEERS(PeersProvider.class),
    /** Batch name/exchange lookup (not one of the spec's nine capabilities; used for peers and followed stocks). */
    LISTINGS(ListingProvider.class);

    private final Class<? extends MarketDataProvider> type;

    Capability(Class<? extends MarketDataProvider> type) {
        this.type = type;
    }

    public Class<? extends MarketDataProvider> type() {
        return type;
    }
}
