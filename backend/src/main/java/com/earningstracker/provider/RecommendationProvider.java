package com.earningstracker.provider;

import java.util.List;

import com.earningstracker.market.RecommendationTrend;

public interface RecommendationProvider extends MarketDataProvider {

    /** Monthly analyst recommendation counts, newest first; may be empty. */
    List<RecommendationTrend> recommendations(String symbol);
}
