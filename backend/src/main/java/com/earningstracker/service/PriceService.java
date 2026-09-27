package com.earningstracker.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.PriceHistoryProvider;
import com.earningstracker.provider.ProviderRouter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Daily bars in {@code prices/{symbol}} (up to 5 years, oldest first, compact {@code {d,o,h,l,c,v}}). Stale once a
 * completed session is missing; then only the new sessions are fetched. If the overlapping bar disagrees with the
 * stored one (split or correction), the full history is fetched again.
 */
@Service
public class PriceService {

    public record StoredBar(String d, double o, double h, double l, double c, long v) {
    }

    public record StoredBars(String symbol, List<StoredBar> bars) {
    }

    static final int YEARS = 5;
    /** Don't ask again within this time even if a session looks missing (holidays). */
    static final Duration MIN_REFETCH_INTERVAL = Duration.ofMinutes(30);
    /** Relative difference of the overlapping close that triggers a full refetch. */
    static final double REWRITE_TOLERANCE = 0.005;
    private static final Duration SETTLE_TIME = Duration.ofMinutes(30);
    private static final Logger log = LoggerFactory.getLogger(PriceService.class);

    private final TieredCache cache;
    private final TieredCache.Policy<StoredBars> policy;
    private final ProviderRouter router;
    private final Clock clock;

    public PriceService(TieredCache cache, ProviderRouter router, JsonMapper jsonMapper, Clock clock) {
        this.cache = cache;
        this.policy = cache.policy("prices", jsonMapper.constructType(StoredBars.class), PriceService::isFresh,
                Duration.ofDays(3), true);
        this.router = router;
        this.clock = clock;
    }

    public Cached<List<PriceBar>> bars(String symbol) {
        Cached<StoredBars> cached = cache.refresh(policy, symbol, previous -> topUp(symbol, previous));
        return new Cached<>(toBars(cached.value()), cached.fetchedAt(), cached.stale());
    }

    static boolean isFresh(StoredBars value, Instant fetchedAt, Instant now) {
        if (fetchedAt.plus(MIN_REFETCH_INTERVAL).isAfter(now)) {
            return true;
        }
        if (value.bars().isEmpty()) {
            return false;
        }
        LocalDate last = LocalDate.parse(value.bars().getLast().d());
        return !last.isBefore(expectedLastSession(Symbols.sessionExchange(value.symbol()), now));
    }

    /** The most recent weekday whose session has closed and settled. */
    static LocalDate expectedLastSession(Exchange exchange, Instant now) {
        ZonedDateTime local = now.atZone(exchange.zone());
        LocalDate day = local.toLocalDate();
        if (local.toLocalTime().isBefore(exchange.close().plus(SETTLE_TIME))) {
            day = day.minusDays(1);
        }
        while (day.getDayOfWeek() == DayOfWeek.SATURDAY || day.getDayOfWeek() == DayOfWeek.SUNDAY) {
            day = day.minusDays(1);
        }
        return day;
    }

    private StoredBars topUp(String symbol, StoredBars previous) {
        LocalDate cutoff = LocalDate.now(clock).minusYears(YEARS).minusDays(7);
        if (previous == null || previous.bars().isEmpty()) {
            return stored(symbol, fetch(symbol, cutoff), cutoff);
        }
        List<PriceBar> bars = toBars(previous);
        PriceBar last = bars.getLast();
        List<PriceBar> fresh = fetch(symbol, last.date());
        if (!fresh.isEmpty() && fresh.getFirst().date().equals(last.date())
                && Math.abs(fresh.getFirst().close() / last.close() - 1) > REWRITE_TOLERANCE) {
            log.info("Stored prices of {} disagree with the provider (split or correction); refetching", symbol);
            return stored(symbol, fetch(symbol, cutoff), cutoff);
        }
        List<PriceBar> merged = new ArrayList<>(bars);
        fresh.stream().filter(bar -> bar.date().isAfter(last.date())).forEach(merged::add);
        return stored(symbol, merged, cutoff);
    }

    private List<PriceBar> fetch(String symbol, LocalDate from) {
        return router.<PriceHistoryProvider, List<PriceBar>>first(Capability.PRICE_HISTORY, Symbols.region(symbol),
                p -> p.dailyBars(symbol, from)).value();
    }

    private static StoredBars stored(String symbol, List<PriceBar> bars, LocalDate cutoff) {
        return new StoredBars(symbol, bars.stream()
                .filter(bar -> !bar.date().isBefore(cutoff))
                .map(bar -> new StoredBar(bar.date().toString(), bar.open(), bar.high(), bar.low(), bar.close(),
                        bar.volume()))
                .toList());
    }

    static List<PriceBar> toBars(StoredBars stored) {
        return stored.bars().stream()
                .map(b -> new PriceBar(LocalDate.parse(b.d()), b.o(), b.h(), b.l(), b.c(), b.v()))
                .toList();
    }
}
