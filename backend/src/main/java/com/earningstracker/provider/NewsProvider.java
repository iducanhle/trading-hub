package com.earningstracker.provider;

import java.util.List;

import com.earningstracker.market.NewsArticle;

public interface NewsProvider extends MarketDataProvider {

    /** Recent articles, newest first; may be empty. */
    List<NewsArticle> news(String symbol, int limit);
}
