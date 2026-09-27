package com.earningstracker.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.market.Region;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderRouter;
import com.earningstracker.provider.SymbolSearchProvider;
import com.earningstracker.web.dto.Dtos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * US and EU search in parallel (each through its own chain), merged: exact symbol matches first, then US and EU
 * results interleaved so neither region crowds out the other. Results are cached in memory for 10 minutes.
 */
@Service
public class SearchService {

    private static final Logger log = LoggerFactory.getLogger(SearchService.class);

    private final TieredCache cache;
    private final TieredCache.Policy<List<SymbolMatch>> policy;
    private final ProviderRouter router;
    private final ExecutorService executor;
    private final ProfileService profiles;

    public SearchService(TieredCache cache, ProviderRouter router, JsonMapper jsonMapper, ExecutorService executor,
            ProfileService profiles) {
        this.cache = cache;
        this.policy = cache.policy("search",
                jsonMapper.getTypeFactory().constructCollectionType(List.class, SymbolMatch.class),
                Duration.ofMinutes(10), false);
        this.router = router;
        this.executor = executor;
        this.profiles = profiles;
    }

    public List<SymbolMatch> search(String query, int limit) {
        String q = query.strip();
        return cache.get(policy, q.toLowerCase(Locale.ROOT) + "|" + limit, () -> searchProviders(q, limit)).value();
    }

    /** Search results as the API returns them; logos only for profiles already in memory (no extra calls). */
    public List<Dtos.SearchResult> results(String query, int limit) {
        return search(query, limit).stream()
                .map(m -> DtoMapper.searchResult(m, profiles.peek(m.symbol()).map(StockProfile::logoUrl).orElse(null)))
                .toList();
    }

    private List<SymbolMatch> searchProviders(String query, int limit) {
        CompletableFuture<List<SymbolMatch>> us = CompletableFuture.supplyAsync(() -> region(query, Region.US, limit),
                executor);
        CompletableFuture<List<SymbolMatch>> eu = CompletableFuture.supplyAsync(() -> region(query, Region.EU, limit),
                executor);
        List<SymbolMatch> usResults = join(us);
        List<SymbolMatch> euResults = join(eu);
        if (usResults == null && euResults == null) {
            throw new ProviderException("search", ProviderException.Kind.UNAVAILABLE, "no search provider answered");
        }
        return rank(query, usResults == null ? List.of() : usResults, euResults == null ? List.of() : euResults, limit);
    }

    private List<SymbolMatch> region(String query, Region region, int limit) {
        return router.<SymbolSearchProvider, List<SymbolMatch>>first(Capability.SEARCH, region,
                p -> p.search(query, region, limit)).value();
    }

    /** Null when that region's search failed (the other region may still answer). */
    private static List<SymbolMatch> join(CompletableFuture<List<SymbolMatch>> future) {
        try {
            return future.join();
        } catch (CompletionException e) {
            log.info("Search failed for one region: {}", e.getCause() == null ? e.getMessage() : e.getCause().getMessage());
            return null;
        }
    }

    static List<SymbolMatch> rank(String query, List<SymbolMatch> us, List<SymbolMatch> eu, int limit) {
        String q = query.toUpperCase(Locale.ROOT);
        Map<String, SymbolMatch> ranked = new LinkedHashMap<>();
        List<SymbolMatch> interleaved = new ArrayList<>();
        for (int i = 0; i < Math.max(us.size(), eu.size()); i++) {
            if (i < us.size()) {
                interleaved.add(us.get(i));
            }
            if (i < eu.size()) {
                interleaved.add(eu.get(i));
            }
        }
        interleaved.stream().filter(m -> baseSymbol(m.symbol()).equals(q)).forEach(m -> ranked.putIfAbsent(m.symbol(), m));
        interleaved.forEach(m -> ranked.putIfAbsent(m.symbol(), m));
        return ranked.values().stream().limit(limit).toList();
    }

    private static String baseSymbol(String symbol) {
        int dot = symbol.indexOf('.');
        return dot < 0 ? symbol : symbol.substring(0, dot);
    }
}
