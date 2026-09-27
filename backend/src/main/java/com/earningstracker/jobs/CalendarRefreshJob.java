package com.earningstracker.jobs;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.fx.FxService;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Region;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.EarningsCalendarProvider;
import com.earningstracker.provider.ListingProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderRouter;
import com.earningstracker.service.CalendarService;
import com.earningstracker.service.EarningsService;
import com.earningstracker.service.ProfileService;
import com.earningstracker.service.StockProfile;
import com.earningstracker.universe.EuUniverse;
import com.earningstracker.web.dto.Dtos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Daily 06:00 (§7). US: the market-wide calendar in 7-day chunks from today−14 to today+45, enriched with market
 * cap and logo (nearest dates first, within the profile budget, reusing profiles up to 30 days old). EU: the seed
 * universe from stored data, plus followed and recently viewed symbols refreshed now. Every event is recorded in
 * {@code earnings/{symbol}}; {@code earningsCalendar/{date}} documents are rewritten only when they change, and dates
 * whose US calendar chunk failed keep their stored US events.
 */
@Component
public class CalendarRefreshJob implements Job {

    public static final String NAME = "calendar-refresh";
    static final int CHUNK_DAYS = 7;
    private static final Logger log = LoggerFactory.getLogger(CalendarRefreshJob.class);
    private static final Comparator<Dtos.EarningsEvent> ORDER = Comparator
            .comparing(Dtos.EarningsEvent::marketCapUsd, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(Dtos.EarningsEvent::symbol);

    private final ProviderRouter router;
    private final ProfileService profiles;
    private final EarningsService earnings;
    private final CalendarService calendar;
    private final FxService fx;
    private final EuUniverse universe;
    private final TrackedSymbols tracked;
    private final JobProperties properties;
    private final Clock clock;

    public CalendarRefreshJob(ProviderRouter router, ProfileService profiles, EarningsService earnings,
            CalendarService calendar, FxService fx, EuUniverse universe, TrackedSymbols tracked,
            JobProperties properties, Clock clock) {
        this.router = router;
        this.profiles = profiles;
        this.earnings = earnings;
        this.calendar = calendar;
        this.fx = fx;
        this.universe = universe;
        this.tracked = tracked;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public Map<String, Object> run() {
        LocalDate today = LocalDate.now(clock.withZone(ZONE));
        LocalDate from = today.minusDays(properties.calendarDaysBack());
        LocalDate to = today.plusDays(properties.calendarDaysAhead());
        Map<String, Object> stats = new LinkedHashMap<>();
        try {
            fx.refresh();
            stats.put("fxRefreshed", true);
        } catch (RuntimeException e) {
            log.warn("FX refresh failed: {}", e.getMessage());
            stats.put("fxRefreshed", false);
        }

        Set<String> followed = tracked.followed();
        Set<String> viewed = tracked.recentlyViewed();
        int followedProfiles = 0;
        for (String symbol : followed) {
            try {
                profiles.refresh(symbol); // §6: market cap of followed symbols is kept 1 day fresh
                followedProfiles++;
            } catch (RuntimeException e) {
                log.info("Profile refresh of followed {} failed: {}", symbol, e.getMessage());
            }
        }
        stats.put("followedProfilesRefreshed", followedProfiles);

        Set<LocalDate> usUnavailable = new HashSet<>();
        List<Dtos.EarningsEvent> events = new ArrayList<>(usEvents(from, to, today, usUnavailable, stats));
        events.addAll(euEvents(from, to, followed, viewed, stats));

        Map<LocalDate, List<Dtos.EarningsEvent>> byDay = events.stream()
                .collect(Collectors.groupingBy(Dtos.EarningsEvent::date));
        int written = 0;
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            List<Dtos.EarningsEvent> day = new ArrayList<>(byDay.getOrDefault(date, List.of()));
            if (usUnavailable.contains(date)) {
                // The US calendar failed for this date: keep what the last successful run stored.
                calendar.storedDay(date).stream().filter(e -> e.region() == Region.US).forEach(day::add);
            }
            day.sort(ORDER);
            if (calendar.saveDayIfChanged(date, day)) {
                written++;
            }
        }
        stats.put("days", ChronoUnit.DAYS.between(from, to) + 1);
        stats.put("daysWritten", written);
        return stats;
    }

    private List<Dtos.EarningsEvent> usEvents(LocalDate from, LocalDate to, LocalDate today,
            Set<LocalDate> unavailable, Map<String, Object> stats) {
        List<EarningsReport> reports = new ArrayList<>();
        int failedChunks = 0;
        for (LocalDate start = from; !start.isAfter(to); start = start.plusDays(CHUNK_DAYS)) {
            LocalDate chunkStart = start;
            LocalDate chunkEnd = start.plusDays(CHUNK_DAYS - 1).isAfter(to) ? to : start.plusDays(CHUNK_DAYS - 1);
            try {
                reports.addAll(router.<EarningsCalendarProvider, List<EarningsReport>>first(Capability.EARNINGS_CALENDAR,
                        Region.US, p -> p.calendar(chunkStart, chunkEnd)).value());
            } catch (ProviderException e) {
                failedChunks++;
                chunkStart.datesUntil(chunkEnd.plusDays(1)).forEach(unavailable::add);
                log.warn("US calendar {}..{} failed: {}", chunkStart, chunkEnd, e.getMessage());
            }
        }
        Map<String, List<EarningsReport>> bySymbol = new LinkedHashMap<>();
        for (EarningsReport report : reports) {
            List<EarningsReport> rows = bySymbol.computeIfAbsent(report.symbol(), s -> new ArrayList<>());
            if (rows.stream().noneMatch(r -> Objects.equals(r.date(), report.date()))) {
                rows.add(report);
            }
        }
        List<String> symbols = bySymbol.keySet().stream()
                .sorted(Comparator.comparingLong(s -> bySymbol.get(s).stream()
                        .mapToLong(r -> Math.abs(ChronoUnit.DAYS.between(today, r.date()))).min().orElse(Long.MAX_VALUE)))
                .toList();
        Map<String, SymbolMatch> listings = listings(Region.US, symbols);

        AtomicInteger budget = new AtomicInteger(properties.maxProfileCallsPerRun());
        int recorded = 0;
        List<Dtos.EarningsEvent> events = new ArrayList<>();
        for (String symbol : symbols) {
            List<EarningsReport> rows = bySymbol.get(symbol);
            try {
                if (earnings.record(symbol, "finnhub", rows)) {
                    recorded++;
                }
            } catch (RuntimeException e) {
                log.info("Could not record calendar entries of {}: {}", symbol, e.getMessage());
            }
            StockProfile profile = profiles.basics(symbol, properties.profileCacheAge(), budget).orElse(null);
            SymbolMatch listing = listings.get(symbol);
            String name = profile != null ? profile.name() : listing != null ? listing.name() : symbol;
            String exchange = listing != null ? listing.exchange().displayName()
                    : profile != null ? profile.exchange().displayName() : "US";
            rows.forEach(r -> events.add(event(symbol, name, exchange, profile, r)));
        }
        stats.put("usReports", reports.size());
        stats.put("usSymbols", symbols.size());
        stats.put("usFailedChunks", failedChunks);
        stats.put("profileCalls", Math.min(properties.maxProfileCallsPerRun(),
                properties.maxProfileCallsPerRun() - budget.get()));
        stats.put("earningsRecorded", recorded);
        return events;
    }

    private List<Dtos.EarningsEvent> euEvents(LocalDate from, LocalDate to, Set<String> followed, Set<String> viewed,
            Map<String, Object> stats) {
        Set<String> live = new LinkedHashSet<>();
        followed.stream().filter(s -> Symbols.region(s) == Region.EU).forEach(live::add);
        viewed.stream().filter(s -> Symbols.region(s) == Region.EU).forEach(live::add);
        Set<String> symbols = new LinkedHashSet<>(live);
        universe.validMembers().forEach(member -> symbols.add(member.symbol()));

        List<Dtos.EarningsEvent> events = new ArrayList<>();
        int refreshed = 0;
        for (String symbol : symbols) {
            Optional<List<EarningsReport>> reports;
            try {
                if (live.contains(symbol)) {
                    reports = Optional.of(earnings.reports(symbol).value());
                    refreshed++;
                } else {
                    reports = earnings.stored(symbol).map(Cached::value);
                }
            } catch (RuntimeException e) {
                log.info("EU earnings of {} unavailable: {}", symbol, e.getMessage());
                reports = earnings.stored(symbol).map(Cached::value);
            }
            if (reports.isEmpty()) {
                continue;
            }
            StockProfile profile = profiles.stored(symbol).orElse(null);
            String name = profile != null ? profile.name()
                    : universe.find(symbol).map(EuUniverse.Member::name).orElse(symbol);
            String exchange = Symbols.euExchange(symbol).orElseThrow().displayName();
            reports.get().stream()
                    .filter(r -> r.date() != null && !r.date().isBefore(from) && !r.date().isAfter(to))
                    .forEach(r -> events.add(event(symbol, name, exchange, profile, r)));
        }
        stats.put("euSymbols", symbols.size());
        stats.put("euRefreshed", refreshed);
        stats.put("euEvents", events.size());
        return events;
    }

    private Map<String, SymbolMatch> listings(Region region, Collection<String> symbols) {
        if (symbols.isEmpty()) {
            return Map.of();
        }
        try {
            return router.<ListingProvider, List<SymbolMatch>>first(Capability.LISTINGS, region,
                    p -> p.listings(symbols)).value().stream()
                    .collect(Collectors.toMap(SymbolMatch::symbol, m -> m, (a, b) -> a));
        } catch (ProviderException e) {
            log.warn("No listing data for the {} calendar: {}", region, e.getMessage());
            return Map.of();
        }
    }

    private static Dtos.EarningsEvent event(String symbol, String name, String exchange, StockProfile profile,
            EarningsReport report) {
        return new Dtos.EarningsEvent(symbol, name, exchange, Symbols.region(symbol),
                profile == null ? null : profile.logoUrl(), report.date(), report.time(), report.fiscalQuarter(),
                report.fiscalYear(), report.currency(), report.epsEstimate(), report.epsActual(),
                report.revenueEstimate(), report.revenueActual(), profile == null ? null : profile.marketCapUsd());
    }
}
