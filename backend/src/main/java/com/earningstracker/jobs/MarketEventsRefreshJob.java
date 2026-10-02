package com.earningstracker.jobs;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.earningstracker.provider.compass.CompassCalendarProvider;
import com.earningstracker.service.CuratedMarketEvents;
import com.earningstracker.service.MarketEventService;
import com.earningstracker.web.dto.Dtos;
import org.springframework.stereotype.Component;

/**
 * Daily 06:30 (§7). Fetches the Compass calendar and merges it with the curated central-bank dates, then rewrites
 * {@code marketEvents/{date}} for every day of the feed's window (and of the curated dates beyond it) whose events
 * changed. Days before the window keep what earlier runs stored. A failed fetch fails the run, so nothing is
 * overwritten and the next run tries again.
 */
@Component
public class MarketEventsRefreshJob implements Job {

    public static final String NAME = "market-events-refresh";
    private static final Comparator<Dtos.MarketEvent> ORDER = Comparator
            .comparing(Dtos.MarketEvent::startsAt, Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing(Dtos.MarketEvent::id);

    private final CompassCalendarProvider compass;
    private final CuratedMarketEvents curated;
    private final MarketEventService events;
    private final Clock clock;

    public MarketEventsRefreshJob(CompassCalendarProvider compass, CuratedMarketEvents curated,
            MarketEventService events, Clock clock) {
        this.compass = compass;
        this.curated = curated;
        this.events = events;
        this.clock = clock;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public Map<String, Object> run() {
        LocalDate today = LocalDate.now(clock.withZone(ZONE));
        CompassCalendarProvider.Feed feed = compass.fetch();
        List<Dtos.MarketEvent> all = new ArrayList<>(feed.events());
        all.addAll(curated.events());

        LocalDate from = today.minusDays(14).isAfter(feed.windowStart()) ? today.minusDays(14) : feed.windowStart();
        LocalDate to = all.stream().map(Dtos.MarketEvent::date).max(Comparator.naturalOrder())
                .filter(last -> last.isAfter(feed.windowEnd())).orElse(feed.windowEnd());
        Map<LocalDate, List<Dtos.MarketEvent>> byDay = all.stream()
                .collect(Collectors.groupingBy(Dtos.MarketEvent::date));
        int written = 0;
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            List<Dtos.MarketEvent> day = new ArrayList<>(byDay.getOrDefault(date, List.of()));
            day.sort(ORDER);
            if (events.saveDayIfChanged(date, day)) {
                written++;
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("compassEvents", feed.events().size());
        stats.put("curatedEvents", curated.events().size());
        stats.put("windowStart", feed.windowStart().toString());
        stats.put("windowEnd", feed.windowEnd().toString());
        stats.put("daysWritten", written);
        return stats;
    }
}
