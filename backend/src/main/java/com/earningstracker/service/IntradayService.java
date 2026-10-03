package com.earningstracker.service;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.market.IntradayBar;
import com.earningstracker.provider.IntradayProvider;
import com.earningstracker.provider.ProviderException;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Intraday bars for the chart: the latest session (1D) or a longer range, in the chosen interval. Kept in memory only (they change every few minutes and
 * are cheap to fetch again): reused for {@link #TTL}, and when every provider fails the last good copy is served
 * as stale. Providers are tried in order.
 */
@Service
public class IntradayService {

    static final Duration TTL = Duration.ofMinutes(2);
    private static final Logger log = LoggerFactory.getLogger(IntradayService.class);

    private final List<IntradayProvider> providers;
    private final Clock clock;
    private final Cache<String, Cached<List<IntradayBar>>> fresh;
    private final Map<String, Cached<List<IntradayBar>>> lastGood = new ConcurrentHashMap<>();

    public IntradayService(List<IntradayProvider> providers, Clock clock) {
        this.providers = providers;
        this.clock = clock;
        this.fresh = Caffeine.newBuilder().expireAfterWrite(TTL).maximumSize(500)
                .ticker(() -> clock.instant().toEpochMilli() * 1_000_000).build();
    }

    public Cached<List<IntradayBar>> bars(String symbol, BarInterval interval, PriceRange range) {
        String key = symbol + "|" + range.label() + "|" + interval.label();
        Cached<List<IntradayBar>> cached = fresh.getIfPresent(key);
        if (cached != null) {
            return cached;
        }
        ProviderException last = null;
        for (IntradayProvider provider : providers) {
            if (!provider.isEnabled()) {
                continue;
            }
            try {
                Cached<List<IntradayBar>> bars = new Cached<>(
                        provider.intradayBars(symbol, interval.length(), range.span()), clock.instant(), false);
                fresh.put(key, bars);
                lastGood.put(key, bars);
                return bars;
            } catch (ProviderException e) {
                log.info("{} intraday bars of {} unavailable: {}", provider.id(), symbol, e.getMessage());
                last = e;
            }
        }
        Cached<List<IntradayBar>> previous = lastGood.get(key);
        if (previous != null) {
            return new Cached<>(previous.value(), previous.fetchedAt(), true);
        }
        if (last != null) {
            throw last;
        }
        return new Cached<>(List.of(), clock.instant(), false);
    }
}
