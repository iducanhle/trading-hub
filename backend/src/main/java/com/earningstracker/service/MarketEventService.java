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

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.market.EventCategory;
import com.earningstracker.market.Importance;
import com.earningstracker.market.Region;
import com.earningstracker.service.CalendarService.RegionFilter;
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
 * The market-events calendar: macro, central-bank and market-structure events stored one
 * {@code marketEvents/{YYYY-MM-DD}} document per day (written by the daily job), plus the earnings of mega caps,
 * which are read from the earnings calendar so they are never stale or duplicated.
 */
@Service
public class MarketEventService {

    public enum EventRegion {
        ALL, US, EU, OTHER
    }

    /** Companies at least this large (USD) count as market-moving reports. */
    public static final double MEGA_CAP_USD = 2e11;
    /** At least this large, the report is a high-importance event. */
    static final double HIGH_CAP_USD = 5e11;
    static final String COLLECTION = "marketEvents";
    private static final Logger log = LoggerFactory.getLogger(MarketEventService.class);
    /** Most important first, then all-day events, then by time. */
    private static final Comparator<Dtos.MarketEvent> ORDER = Comparator
            .comparing(Dtos.MarketEvent::importance, Comparator.reverseOrder())
            .thenComparing(Dtos.MarketEvent::startsAt, Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing(Dtos.MarketEvent::title);

    private final DocumentStore store;
    private final CalendarService earningsCalendar;
    private final JsonMapper jsonMapper;
    private final JavaType eventsType;
    private final Clock clock;
    private final Cache<LocalDate, List<Dtos.MarketEvent>> days = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(10)).maximumSize(600).build();

    public MarketEventService(DocumentStore store, CalendarService earningsCalendar, JsonMapper jsonMapper,
            Clock clock) {
        this.store = store;
        this.earningsCalendar = earningsCalendar;
        this.jsonMapper = jsonMapper;
        this.eventsType = jsonMapper.getTypeFactory().constructCollectionType(List.class, Dtos.MarketEvent.class);
        this.clock = clock;
    }

    /**
     * Every date of the range, possibly empty; events with at least {@code minImportance}, most important first.
     * Mega-cap reports are left out (and not even read) when {@code includeEarnings} is false.
     */
    public Dtos.MarketEvents events(LocalDate from, LocalDate to, Importance minImportance, EventRegion region,
            boolean includeEarnings) {
        List<LocalDate> dates = from.datesUntil(to.plusDays(1)).toList();
        Map<LocalDate, List<Dtos.MarketEvent>> stored = load(dates);
        Map<LocalDate, List<Dtos.MarketEvent>> reports = includeEarnings ? megaCapReports(from, to) : Map.of();
        List<Dtos.MarketEventDay> result = dates.stream().map(date -> {
            List<Dtos.MarketEvent> all = new ArrayList<>(stored.get(date));
            all.addAll(reports.getOrDefault(date, List.of()));
            return new Dtos.MarketEventDay(date, all.stream()
                    .filter(e -> e.importance().compareTo(minImportance) >= 0)
                    .filter(e -> region == EventRegion.ALL || regionOf(e) == region)
                    .sorted(ORDER)
                    .toList());
        }).toList();
        return new Dtos.MarketEvents(from, to, result);
    }

    /** Replaces one day's stored events only if they changed (saves Firestore writes on the daily rebuild). */
    public boolean saveDayIfChanged(LocalDate date, List<Dtos.MarketEvent> events) {
        if (Set.copyOf(storedDay(date)).equals(Set.copyOf(events))) {
            days.put(date, List.copyOf(events));
            return false;
        }
        Instant now = clock.instant();
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("events", jsonMapper.convertValue(events, Object.class));
        doc.put("updatedAt", Timestamp.ofTimeSecondsAndNanos(now.getEpochSecond(), now.getNano()));
        store.set(COLLECTION, date.toString(), doc);
        days.put(date, List.copyOf(events));
        return true;
    }

    /** One day's stored events, bypassing the memory cache. */
    public List<Dtos.MarketEvent> storedDay(LocalDate date) {
        return store.get(COLLECTION, date.toString()).map(this::events).orElseGet(List::of);
    }

    private Map<LocalDate, List<Dtos.MarketEvent>> megaCapReports(LocalDate from, LocalDate to) {
        Map<LocalDate, List<Dtos.MarketEvent>> result = new LinkedHashMap<>();
        for (Dtos.CalendarDay day : earningsCalendar.calendar(from, to, MEGA_CAP_USD, RegionFilter.ALL, false, null)
                .days()) {
            result.put(day.date(), day.events().stream().map(MarketEventService::report).toList());
        }
        return result;
    }

    private static Dtos.MarketEvent report(Dtos.EarningsEvent e) {
        Importance importance = e.marketCapUsd() != null && e.marketCapUsd() >= HIGH_CAP_USD ? Importance.HIGH
                : Importance.MEDIUM;
        return new Dtos.MarketEvent("earnings-" + e.symbol() + "-" + e.date(), e.date(), null, true,
                e.name() + " earnings", e.symbol(), EventCategory.EARNINGS, e.region() == Region.US ? "US" : "EU",
                importance, null, null, null, e.symbol(), e.logoUrl(), e.time());
    }

    private static EventRegion regionOf(Dtos.MarketEvent event) {
        return switch (event.country()) {
            case "US" -> EventRegion.US;
            case "EU" -> EventRegion.EU;
            default -> EventRegion.OTHER;
        };
    }

    private Map<LocalDate, List<Dtos.MarketEvent>> load(List<LocalDate> dates) {
        Map<LocalDate, List<Dtos.MarketEvent>> result = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        for (LocalDate date : dates) {
            List<Dtos.MarketEvent> cached = days.getIfPresent(date);
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
                log.warn("Reading the market events failed: {}", e.getMessage());
                docs = Map.of();
            }
            for (String id : missing) {
                List<Dtos.MarketEvent> events = docs.containsKey(id) ? events(docs.get(id)) : List.of();
                days.put(LocalDate.parse(id), events);
                result.put(LocalDate.parse(id), events);
            }
        }
        return result;
    }

    private List<Dtos.MarketEvent> events(Map<String, Object> doc) {
        Object events = doc.get("events");
        return events == null ? List.of() : jsonMapper.convertValue(events, eventsType);
    }
}
