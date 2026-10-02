package com.earningstracker.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.earningstracker.market.EventCategory;
import com.earningstracker.market.Importance;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;
import com.earningstracker.provider.ProviderTestSupport;
import com.earningstracker.service.MarketEventService.EventRegion;
import com.earningstracker.web.dto.Dtos;
import org.junit.jupiter.api.Test;

class MarketEventServiceTest {

    private final ServiceFixture f = new ServiceFixture();
    private final MarketEventService service = new MarketEventService(f.store, f.calendar, ProviderTestSupport.JSON,
            f.clock);

    private static Dtos.MarketEvent event(String id, String date, String time, String country, Importance importance) {
        return new Dtos.MarketEvent(id, LocalDate.parse(date), time == null ? null : Instant.parse(time), time == null,
                id, id, EventCategory.INFLATION, country, importance, null, null, null, null, null, null);
    }

    private static Dtos.EarningsEvent report(String symbol, String date, Region region, Double marketCapUsd) {
        return new Dtos.EarningsEvent(symbol, symbol + " Inc.", "NASDAQ", region, "https://logo.example/" + symbol,
                LocalDate.parse(date), ReportTime.AMC, 3, 2026, "USD", 1.0, null, null, null, marketCapUsd);
    }

    @Test
    void savesADayOnlyWhenItsEventsChanged() {
        LocalDate day = LocalDate.parse("2026-10-14");
        List<Dtos.MarketEvent> events = List.of(event("cpi", "2026-10-14", "2026-10-14T12:30:00Z", "US", Importance.HIGH));

        assertThat(service.saveDayIfChanged(day, events)).isTrue();
        assertThat(service.saveDayIfChanged(day, events)).isFalse();
        assertThat(service.saveDayIfChanged(LocalDate.parse("2026-10-15"), List.of())).as("empty day, no document")
                .isFalse();
        assertThat(service.storedDay(day)).isEqualTo(events);
    }

    @Test
    void returnsEveryDateSortedByImportanceThenTimeAndFilteredByImportanceAndRegion() {
        service.saveDayIfChanged(LocalDate.parse("2026-10-28"), List.of(
                event("ppi", "2026-10-28", "2026-10-28T12:30:00Z", "US", Importance.MEDIUM),
                event("fomc", "2026-10-28", "2026-10-28T18:00:00Z", "US", Importance.HIGH),
                event("holiday", "2026-10-28", null, "US", Importance.LOW),
                event("ecb", "2026-10-28", "2026-10-28T13:15:00Z", "EU", Importance.HIGH),
                event("boj", "2026-10-28", null, "JP", Importance.MEDIUM)));

        Dtos.MarketEvents all = service.events(LocalDate.parse("2026-10-27"), LocalDate.parse("2026-10-29"),
                Importance.LOW, EventRegion.ALL, true);
        assertThat(all.days()).extracting(Dtos.MarketEventDay::date)
                .containsExactly(LocalDate.parse("2026-10-27"), LocalDate.parse("2026-10-28"), LocalDate.parse("2026-10-29"));
        assertThat(all.days().get(0).events()).isEmpty();
        assertThat(all.days().get(1).events()).extracting(Dtos.MarketEvent::id)
                .containsExactly("ecb", "fomc", "boj", "ppi", "holiday");

        assertThat(service.events(LocalDate.parse("2026-10-28"), LocalDate.parse("2026-10-28"), Importance.MEDIUM,
                EventRegion.ALL, true).days().getFirst().events()).extracting(Dtos.MarketEvent::id)
                .containsExactly("ecb", "fomc", "boj", "ppi");
        assertThat(service.events(LocalDate.parse("2026-10-28"), LocalDate.parse("2026-10-28"), Importance.LOW,
                EventRegion.EU, true).days().getFirst().events()).extracting(Dtos.MarketEvent::id).containsExactly("ecb");
        assertThat(service.events(LocalDate.parse("2026-10-28"), LocalDate.parse("2026-10-28"), Importance.LOW,
                EventRegion.OTHER, true).days().getFirst().events()).extracting(Dtos.MarketEvent::id).containsExactly("boj");
    }

    @Test
    void addsTheReportsOfMegaCapsFromTheEarningsCalendar() {
        LocalDate day = LocalDate.parse("2026-10-29");
        f.calendar.saveDay(day, List.of(
                report("AAPL", "2026-10-29", Region.US, 3.6e12),
                report("ORCL", "2026-10-29", Region.US, 2.5e11),
                report("SMALL", "2026-10-29", Region.US, 5e9),
                report("NOCAP", "2026-10-29", Region.US, null),
                report("SAP.DE", "2026-10-29", Region.EU, 2.4e11)));

        List<Dtos.MarketEvent> events = service.events(day, day, Importance.LOW, EventRegion.ALL, true).days().getFirst()
                .events();

        assertThat(events).extracting(Dtos.MarketEvent::symbol).containsExactly("AAPL", "ORCL", "SAP.DE");
        Dtos.MarketEvent aapl = events.getFirst();
        assertThat(aapl).extracting(Dtos.MarketEvent::category, Dtos.MarketEvent::importance, Dtos.MarketEvent::country,
                Dtos.MarketEvent::allDay, Dtos.MarketEvent::reportTime, Dtos.MarketEvent::label,
                Dtos.MarketEvent::logoUrl)
                .containsExactly(EventCategory.EARNINGS, Importance.HIGH, "US", true, ReportTime.AMC, "AAPL",
                        "https://logo.example/AAPL");
        assertThat(events.get(1).importance()).as("$250B is a medium event").isEqualTo(Importance.MEDIUM);
        assertThat(service.events(day, day, Importance.LOW, EventRegion.ALL, false).days().getFirst().events())
                .as("reports can be switched off").isEmpty();
        assertThat(service.events(day, day, Importance.HIGH, EventRegion.EU, true).days().getFirst().events())
                .as("SAP is medium").isEmpty();
        assertThat(service.events(day, day, Importance.LOW, EventRegion.EU, true).days().getFirst().events())
                .extracting(Dtos.MarketEvent::symbol).containsExactly("SAP.DE");
    }
}
