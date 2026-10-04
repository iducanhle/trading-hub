package com.earningstracker.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.market.Logos;
import com.earningstracker.market.Region;
import com.earningstracker.web.dto.Dtos;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.google.cloud.Timestamp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.json.JsonMapper;

/**
 * The earnings calendar: one {@code earningsCalendar/{YYYY-MM-DD}} document per day (written by the daily job), so
 * a 6-week range costs at most 42 reads; days stay in memory for 10 minutes.
 */
@Service
public class CalendarService {

    public enum RegionFilter {
        ALL, US, EU
    }

    public static final int MAX_DAYS = 42;
    static final String COLLECTION = "earningsCalendar";
    private static final Logger log = LoggerFactory.getLogger(CalendarService.class);
    private static final Comparator<Dtos.EarningsEvent> BY_MARKET_CAP = Comparator.comparing(
            Dtos.EarningsEvent::marketCapUsd, Comparator.nullsLast(Comparator.reverseOrder()));

    private final DocumentStore store;
    private final FollowService follows;
    private final JsonMapper jsonMapper;
    private final JavaType eventsType;
    private final Clock clock;
    private final Cache<LocalDate, List<Dtos.EarningsEvent>> days = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(10)).maximumSize(400).build();

    public CalendarService(DocumentStore store, FollowService follows, JsonMapper jsonMapper, Clock clock) {
        this.store = store;
        this.follows = follows;
        this.jsonMapper = jsonMapper;
        this.eventsType = jsonMapper.getTypeFactory().constructCollectionType(List.class, Dtos.EarningsEvent.class);
        this.clock = clock;
    }

    /** Every date of the range, possibly empty; events sorted by USD market cap, unknown caps last. */
    public Dtos.Calendar calendar(LocalDate from, LocalDate to, double minMarketCapUsd, RegionFilter region,
            boolean followedOnly, String uid) {
        List<LocalDate> dates = from.datesUntil(to.plusDays(1)).toList();
        Map<LocalDate, List<Dtos.EarningsEvent>> events = load(dates);
        Set<String> followed = followedOnly
                ? follows.follows(uid).stream().map(FollowService.Follow::symbol).collect(Collectors.toSet())
                : null;
        List<Dtos.CalendarDay> result = dates.stream().map(date -> new Dtos.CalendarDay(date, events.get(date).stream()
                .filter(e -> region == RegionFilter.ALL || e.region() == Region.valueOf(region.name()))
                .filter(e -> minMarketCapUsd <= 0 || (e.marketCapUsd() != null && e.marketCapUsd() >= minMarketCapUsd))
                .filter(e -> followed == null || followed.contains(e.symbol()))
                .sorted(BY_MARKET_CAP)
                .toList())).toList();
        return new Dtos.Calendar(from, to, result);
    }

    /** Replaces one day's events (calendar jobs). */
    public void saveDay(LocalDate date, List<Dtos.EarningsEvent> events) {
        Instant now = clock.instant();
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("events", jsonMapper.convertValue(events, Object.class));
        doc.put("updatedAt", Timestamp.ofTimeSecondsAndNanos(now.getEpochSecond(), now.getNano()));
        store.set(COLLECTION, date.toString(), doc);
        days.put(date, List.copyOf(events));
    }

    /** Writes the day only if its events changed (saves Firestore writes on the daily rebuild). */
    public boolean saveDayIfChanged(LocalDate date, List<Dtos.EarningsEvent> events) {
        if (Set.copyOf(storedDay(date)).equals(Set.copyOf(events))) {
            days.put(date, List.copyOf(events));
            return false;
        }
        saveDay(date, events);
        return true;
    }

    /** One day's stored events, bypassing the memory cache (jobs merge into it). */
    public List<Dtos.EarningsEvent> storedDay(LocalDate date) {
        return store.get(COLLECTION, date.toString()).map(this::events).orElseGet(List::of);
    }

    private Map<LocalDate, List<Dtos.EarningsEvent>> load(List<LocalDate> dates) {
        Map<LocalDate, List<Dtos.EarningsEvent>> result = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        for (LocalDate date : dates) {
            List<Dtos.EarningsEvent> cached = days.getIfPresent(date);
            if (cached != null) {
                result.put(date, cached);
            } else {
                missing.add(date.toString());
            }
        }
        if (!missing.isEmpty()) {
            Map<String, Map<String, Object>> docs;
            try {
                docs = store.getAll(COLLECTION, missing);
            } catch (RuntimeException e) {
                log.warn("Reading the earnings calendar failed: {}", e.getMessage());
                docs = Map.of();
            }
            for (String id : missing) {
                List<Dtos.EarningsEvent> events = docs.containsKey(id) ? events(docs.get(id)) : List.of();
                days.put(LocalDate.parse(id), events);
                result.put(LocalDate.parse(id), events);
            }
        }
        return result;
    }

    private List<Dtos.EarningsEvent> events(Map<String, Object> doc) {
        Object events = doc.get("events");
        if (events == null) {
            return List.of();
        }
        List<Dtos.EarningsEvent> parsed = jsonMapper.convertValue(events, eventsType);
        return parsed.stream().map(CalendarService::withCleanLogo).toList();
    }

    /** Stored days hold logos from retired fallbacks, and none for stocks without a provider logo. */
    private static Dtos.EarningsEvent withCleanLogo(Dtos.EarningsEvent e) {
        String logo = Logos.orParqet(e.symbol(), e.logoUrl());
        return java.util.Objects.equals(logo, e.logoUrl()) ? e
                : new Dtos.EarningsEvent(e.symbol(), e.name(), e.exchange(), e.region(), logo, e.date(), e.time(),
                        e.fiscalQuarter(), e.fiscalYear(), e.currency(), e.epsEstimate(), e.epsActual(),
                        e.revenueEstimate(), e.revenueActual(), e.marketCapUsd());
    }
}
