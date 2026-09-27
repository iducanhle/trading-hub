package com.earningstracker.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.market.NewsArticle;
import com.earningstracker.market.RecommendationTrend;
import com.earningstracker.market.Region;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.ListingProvider;
import com.earningstracker.provider.NewsProvider;
import com.earningstracker.provider.PeersProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderRouter;
import com.earningstracker.provider.RecommendationProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.json.JsonMapper;

/** News (30 min), recommendations and peers (1 day), all in memory only (§6). */
@Service
public class StockExtrasService {

    /** Articles fetched per symbol; requests take the newest {@code limit} of them. */
    static final int NEWS_FETCHED = 50;
    static final int MAX_PEERS = 8;
    private static final Logger log = LoggerFactory.getLogger(StockExtrasService.class);

    private final TieredCache cache;
    private final ProviderRouter router;
    private final TieredCache.Policy<List<NewsArticle>> news;
    private final TieredCache.Policy<List<RecommendationTrend>> recommendations;
    private final TieredCache.Policy<List<SymbolMatch>> peers;

    public StockExtrasService(TieredCache cache, ProviderRouter router, JsonMapper jsonMapper) {
        this.cache = cache;
        this.router = router;
        this.news = cache.policy("news", listOf(jsonMapper, NewsArticle.class), Duration.ofMinutes(30), false);
        this.recommendations = cache.policy("recommendations", listOf(jsonMapper, RecommendationTrend.class),
                Duration.ofDays(1), false);
        this.peers = cache.policy("peers", listOf(jsonMapper, SymbolMatch.class), Duration.ofDays(1), false);
    }

    public Cached<List<NewsArticle>> news(String symbol) {
        return cache.get(news, symbol, () -> router.<NewsProvider, List<NewsArticle>>first(Capability.NEWS,
                Symbols.region(symbol), p -> p.news(symbol, NEWS_FETCHED)).value());
    }

    public Cached<List<RecommendationTrend>> recommendations(String symbol) {
        return cache.get(recommendations, symbol, () -> router.<RecommendationProvider, List<RecommendationTrend>>first(
                Capability.RECOMMENDATIONS, Symbols.region(symbol), p -> p.recommendations(symbol)).value());
    }

    /** Similar companies with their names and exchanges, in the provider's order; unsupported listings dropped. */
    public Cached<List<SymbolMatch>> peers(String symbol) {
        return cache.get(peers, symbol, () -> {
            List<String> symbols = router.<PeersProvider, List<String>>first(Capability.PEERS, Symbols.region(symbol),
                    p -> p.peers(symbol)).value().stream().limit(MAX_PEERS * 2L).toList();
            Map<String, SymbolMatch> found = new LinkedHashMap<>();
            symbols.stream().collect(Collectors.groupingBy(Symbols::region)).forEach((region, group) ->
                    listings(region, group).forEach(match -> found.put(match.symbol(), match)));
            return symbols.stream().filter(found::containsKey).map(found::get).limit(MAX_PEERS).toList();
        });
    }

    private List<SymbolMatch> listings(Region region, Collection<String> symbols) {
        try {
            return router.<ListingProvider, List<SymbolMatch>>first(Capability.LISTINGS, region,
                    p -> p.listings(symbols)).value();
        } catch (ProviderException e) {
            log.info("No listing data for peers {}: {}", symbols, e.getMessage());
            return new ArrayList<>();
        }
    }

    private static JavaType listOf(JsonMapper jsonMapper, Class<?> type) {
        return jsonMapper.getTypeFactory().constructCollectionType(List.class, type);
    }
}
