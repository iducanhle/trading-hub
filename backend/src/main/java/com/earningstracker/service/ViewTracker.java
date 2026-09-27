package com.earningstracker.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.market.Symbols;
import com.google.cloud.Timestamp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Remembers which stocks were opened ({@code viewed/{symbol}}), so the jobs also refresh recently viewed symbols.
 * Written at most once per symbol per day, in the background.
 */
@Service
public class ViewTracker {

    private static final Logger log = LoggerFactory.getLogger(ViewTracker.class);

    private final DocumentStore store;
    private final ExecutorService executor;
    private final Clock clock;
    private final Map<String, LocalDate> recorded = new ConcurrentHashMap<>();

    public ViewTracker(DocumentStore store, ExecutorService executor, Clock clock) {
        this.store = store;
        this.executor = executor;
        this.clock = clock;
    }

    public void viewed(String symbol) {
        LocalDate today = LocalDate.now(clock);
        if (today.equals(recorded.put(symbol, today))) {
            return;
        }
        Instant now = clock.instant();
        executor.execute(() -> {
            try {
                store.set("viewed", symbol, Map.of("symbol", symbol,
                        "lastViewedAt", Timestamp.ofTimeSecondsAndNanos(now.getEpochSecond(), now.getNano())));
            } catch (RuntimeException e) {
                recorded.remove(symbol);
                log.info("Could not record the view of {}: {}", symbol, e.getMessage());
            }
        });
    }

    /** Symbols opened within {@code within}. */
    public List<String> recentlyViewed(Duration within) {
        Instant since = clock.instant().minus(within);
        return store.list("viewed").entrySet().stream()
                .filter(e -> e.getValue().get("lastViewedAt") instanceof Timestamp ts
                        && Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos()).isAfter(since))
                .map(Map.Entry::getKey)
                .filter(Symbols::isValid)
                .toList();
    }
}
