package com.earningstracker.service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.stream.Collectors;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.domain.EarningsMerger;
import com.earningstracker.domain.EarningsMerger.SourcedReport;
import com.earningstracker.market.EarningsReport;
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
 * Per-symbol earnings in {@code earnings/{symbol}}. The document keeps each provider's own rows (one per quarter,
 * replaced when that provider sends a newer version), so history that has left a provider's window is kept and the
 * source priority is applied field by field on every read. Fresh for 1 day.
 */
@Service
public class EarningsService {

    public record StoredEarnings(List<SourcedReport> reports) {
    }

    /** Rows kept per provider: 12 quarters of history plus upcoming ones and margin. */
    static final int MAX_ROWS_PER_SOURCE = 24;
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
        Cached<StoredEarnings> cached = cache.refresh(policy, symbol, previous -> fetch(symbol, previous));
        return new Cached<>(merged(symbol, cached.value()), cached.fetchedAt(), cached.stale());
    }

    /** Stored reports only (L1 or Firestore), without calling providers. */
    public Optional<Cached<List<EarningsReport>>> stored(String symbol) {
        return cache.stored(policy, symbol).map(c -> new Cached<>(merged(symbol, c.value()), c.fetchedAt(), c.stale()));
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
     * Adds rows seen elsewhere (calendar jobs) without calling providers. The stored fetch time is kept, so the next
     * on-demand read still asks the providers for the full history. Returns whether anything changed.
     */
    public boolean record(String symbol, String source, List<EarningsReport> observed) {
        Optional<Cached<StoredEarnings>> previous = cache.stored(policy, symbol);
        List<SourcedReport> before = previous.map(c -> c.value().reports()).orElse(List.of());
        List<SourcedReport> rows = upsert(before, observed.stream().map(r -> new SourcedReport(source, r)).toList());
        if (Set.copyOf(rows).equals(Set.copyOf(before))) {
            return false; // nothing new: save the Firestore write
        }
        cache.put(policy, symbol, new StoredEarnings(rows), previous.map(Cached::fetchedAt).orElse(Instant.EPOCH));
        return true;
    }

    /** Fetches from the providers now, whatever the age of the stored data (jobs filling in actuals). */
    public List<EarningsReport> refreshNow(String symbol) {
        StoredEarnings fresh = fetch(symbol, cache.stored(policy, symbol).map(Cached::value).orElse(null));
        cache.put(policy, symbol, fresh);
        return merged(symbol, fresh);
    }

    private StoredEarnings fetch(String symbol, StoredEarnings previous) {
        List<Sourced<List<EarningsReport>>> results = router.all(Capability.EARNINGS, Symbols.region(symbol),
                (EarningsProvider p) -> p.earnings(symbol));
        List<SourcedReport> fresh = results.stream()
                .flatMap(result -> result.value().stream().map(report -> new SourcedReport(result.provider(), report)))
                .toList();
        return new StoredEarnings(upsert(previous == null ? List.of() : previous.reports(), fresh));
    }

    private List<EarningsReport> merged(String symbol, StoredEarnings stored) {
        return EarningsMerger.merge(stored.reports(), router.chainIds(Capability.EARNINGS, Symbols.region(symbol)))
                .stream().map(SourcedReport::report).toList();
    }

    /**
     * Stored rows plus fresh ones, where a fresh row replaces the stored rows of the same source for the same quarter.
     * Each source keeps its newest {@value #MAX_ROWS_PER_SOURCE} rows.
     */
    static List<SourcedReport> upsert(List<SourcedReport> stored, List<SourcedReport> fresh) {
        List<SourcedReport> rows = new ArrayList<>();
        stored.stream()
                .filter(old -> fresh.stream().noneMatch(f -> f.source().equals(old.source())
                        && EarningsMerger.sameQuarter(f.report(), old.report())))
                .forEach(rows::add);
        rows.addAll(fresh);
        Map<String, List<SourcedReport>> bySource = rows.stream()
                .collect(Collectors.groupingBy(SourcedReport::source));
        return bySource.values().stream()
                .flatMap(list -> list.stream()
                        .sorted(Comparator.comparing(EarningsService::sortDate, Comparator.nullsLast(Comparator.reverseOrder())))
                        .limit(MAX_ROWS_PER_SOURCE))
                .toList();
    }

    private static LocalDate sortDate(SourcedReport row) {
        return Objects.requireNonNullElse(row.report().date(), row.report().periodEnd());
    }
}
