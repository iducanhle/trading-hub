package com.earningstracker.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.cache.TieredCache;
import com.earningstracker.market.Region;
import com.earningstracker.market.Symbols;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads {@code users/{uid}/follows}, which the frontend writes directly. Cached in memory for a minute.
 */
@Service
public class FollowService {

    /** A followed stock as the frontend stored it ({@code exchange} is the display name). */
    public record Follow(String symbol, String name, String exchange, Region region, String logoUrl) {
    }

    private final DocumentStore store;
    private final TieredCache cache;
    private final TieredCache.Policy<List<Follow>> policy;

    public FollowService(DocumentStore store, TieredCache cache, JsonMapper jsonMapper) {
        this.store = store;
        this.cache = cache;
        this.policy = cache.policy("follows",
                jsonMapper.getTypeFactory().constructCollectionType(List.class, Follow.class), Duration.ofMinutes(1),
                false);
    }

    public List<Follow> follows(String uid) {
        return cache.get(policy, uid, () -> store.list("users/" + uid + "/follows").entrySet().stream()
                .map(FollowService::follow)
                .flatMap(Optional::stream)
                .toList()).value();
    }

    private static Optional<Follow> follow(Map.Entry<String, Map<String, Object>> document) {
        Map<String, Object> data = document.getValue();
        return Symbols.normalize(text(data.get("symbol"), document.getKey())).map(symbol -> {
            Region region = Symbols.region(symbol);
            return new Follow(symbol, text(data.get("name"), symbol), text(data.get("exchange"), null), region,
                    text(data.get("logoUrl"), null));
        });
    }

    private static String text(Object value, String fallback) {
        return value instanceof String s && !s.isBlank() ? s : fallback;
    }
}
