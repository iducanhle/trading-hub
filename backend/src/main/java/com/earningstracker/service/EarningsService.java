package com.earningstracker.service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.domain.EarningsMerger;
import com.earningstracker.domain.EarningsMerger.SourcedReport;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Region;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.EarningsProvider;
import com.earningstracker.provider.ProviderRouter;
import com.earningstracker.provider.Sourced;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Per-symbol earnings in {@code earnings/{symbol}}: every provider of the region's chain, merged with what earlier
 * runs and the calendar jobs stored, so the history builds up over time. Fresh for 1 day.
 */
@Service
public class EarningsService {

    public record StoredEarnings(List<SourcedReport> reports) {
    }

    /** Reports kept per symbol: enough for 12 quarters of history plus upcoming ones. */
    static final int MAX_STORED = 32;
    private static final Logger log = LoggerFactory.getLogger(EarningsService.class);

    private final TieredCache cache;
    private final TieredCache.Policy<StoredEarnings> policy;
    private final ProviderRouter router;
    private final ExecutorService executor;
    private final Set<String> warming = ConcurrentHashMap.newKeySet();

    public EarningsService(TieredCache cache, ProviderRouter router, JsonMapper jsonMapper, ExecutorService executor) {
        this.cache = cache;
        this.policy = cache.policy("earnings", jsonMapper.constructType(StoredEarnings.class), Duration.ofDays(1), true);
        this.router = router;
        this.executor = executor;
    }

    /** Merged reports, newest first; fetched from the providers when older than a day. */
    public Cached<List<EarningsReport>> reports(String symbol) {
        Cached<StoredEarnings> cached = cache.refresh(policy, symbol, previous -> fetchAndMerge(symbol, previous));
        return new Cached<>(reports(cached.value()), cached.fetchedAt(), cached.stale());
    }

    /** Stored reports only (L1 or Firestore), without calling providers. */
    public Optional<Cached<List<EarningsReport>>> stored(String symbol) {
        return cache.stored(policy, symbol).map(c -> new Cached<>(reports(c.value()), c.fetchedAt(), c.stale()));
    }

    /** Loads a symbol in the background (once at a time), e.g. a followed stock nobody has opened yet. */
    public void warmUp(String symbol) {
        if (warming.add(symbol)) {
            executor.execute(() -> {
                try {
                    reports(symbol);
                } catch (RuntimeException e) {
                    log.info("Background earnings load for {} failed: {}", symbol, e.getMessage());
                } finally {
                    warming.remove(symbol);
                }
            });
        }
    }

    /**
     * Merges reports seen elsewhere (calendar jobs) into the stored history without calling providers. The stored
     * fetch time is kept, so the next on-demand read still asks the providers for the full history.
     */
    public void record(String symbol, String source, List<EarningsReport> observed) {
        Optional<Cached<StoredEarnings>> previous = cache.stored(policy, symbol);
        StoredEarnings merged = merge(symbol, observed.stream().map(r -> new SourcedReport(source, r)).toList(),
                previous.map(Cached::value).orElse(null));
        cache.put(policy, symbol, merged, previous.map(Cached::fetchedAt).orElse(Instant.EPOCH));
    }

    private StoredEarnings fetchAndMerge(String symbol, StoredEarnings previous) {
        List<Sourced<List<EarningsReport>>> results = router.all(Capability.EARNINGS, Symbols.region(symbol),
                (EarningsProvider p) -> p.earnings(symbol));
        List<SourcedReport> fresh = results.stream()
                .flatMap(result -> result.value().stream().map(report -> new SourcedReport(result.provider(), report)))
                .toList();
        return merge(symbol, fresh, previous);
    }

    private StoredEarnings merge(String symbol, List<SourcedReport> fresh, StoredEarnings previous) {
        Region region = Symbols.region(symbol);
        List<SourcedReport> merged = EarningsMerger.merge(fresh, previous == null ? List.of() : previous.reports(),
                router.chainIds(Capability.EARNINGS, region));
        return new StoredEarnings(merged.stream().limit(MAX_STORED).toList());
    }

    private static List<EarningsReport> reports(StoredEarnings stored) {
        return stored.reports().stream().map(SourcedReport::report).toList();
    }
}
