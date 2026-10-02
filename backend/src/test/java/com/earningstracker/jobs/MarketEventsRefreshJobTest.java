package com.earningstracker.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.earningstracker.market.EventCategory;
import com.earningstracker.market.Importance;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.ProviderTestSupport;
import com.earningstracker.provider.compass.CompassCalendarProvider;
import com.earningstracker.service.CuratedMarketEvents;
import com.earningstracker.service.MarketEventService;
import com.earningstracker.service.ServiceFixture;
import com.earningstracker.web.dto.Dtos;
import org.junit.jupiter.api.Test;

class MarketEventsRefreshJobTest {

    // The fixture clock is Sunday 2026-09-27 10:00 UTC, the first day of the feed's window.
    private final ServiceFixture f = new ServiceFixture();
    private final CompassCalendarProvider compass = mock(CompassCalendarProvider.class);
    private final CuratedMarketEvents curated = new CuratedMarketEvents(ProviderTestSupport.JSON);
    private final MarketEventService events = new MarketEventService(f.store, f.calendar, ProviderTestSupport.JSON,
            f.clock);
    private final MarketEventsRefreshJob job = new MarketEventsRefreshJob(compass, curated, events, f.clock);

    private static Dtos.MarketEvent compassEvent(String id, String date) {
        return new Dtos.MarketEvent(id, LocalDate.parse(date), Instant.parse(date + "T12:30:00Z"), false, id, "CPI",
                EventCategory.INFLATION, "US", Importance.HIGH, null, 1.2, null, null, null, null);
    }

    private static CompassCalendarProvider.Feed feed(String end, Dtos.MarketEvent... events) {
        return new CompassCalendarProvider.Feed(LocalDate.parse("2026-09-27"), LocalDate.parse(end), List.of(events));
    }

    @Test
    void writesFeedAndCuratedEventsAndOnlyRewritesChangedDays() {
        given(compass.fetch()).willReturn(feed("2027-10-28", compassEvent("compass-cpi", "2026-10-14")));

        Map<String, Object> stats = job.run();

        assertThat(stats).containsEntry("compassEvents", 1).containsEntry("windowEnd", "2027-10-28");
        assertThat(events.storedDay(LocalDate.parse("2026-10-14"))).extracting(Dtos.MarketEvent::id)
                .containsExactly("compass-cpi");
        // The ECB decision (14:15 CET = 13:15 UTC) and the BoJ day come from the curated list.
        assertThat(events.storedDay(LocalDate.parse("2026-10-29"))).extracting(Dtos.MarketEvent::id)
                .containsExactly("ecb-2026-10-29");
        assertThat(events.storedDay(LocalDate.parse("2026-10-29")).getFirst().startsAt())
                .isEqualTo(Instant.parse("2026-10-29T13:15:00Z"));
        assertThat(events.storedDay(LocalDate.parse("2026-10-30")).getFirst())
                .extracting(Dtos.MarketEvent::id, Dtos.MarketEvent::allDay, Dtos.MarketEvent::country)
                .containsExactly("boj-2026-10-30", true, "JP");
        assertThat(events.storedDay(LocalDate.parse("2027-12-17"))).extracting(Dtos.MarketEvent::id)
                .contains("boj-2027-12-17");
        assertThat((int) stats.get("daysWritten")).isPositive();

        assertThat(job.run()).as("a second run with the same feed writes nothing").containsEntry("daysWritten", 0);
    }

    @Test
    void replacesTheEventsOfDaysInsideTheWindowWhenTheFeedChanges() {
        given(compass.fetch()).willReturn(feed("2027-10-28", compassEvent("compass-cpi", "2026-10-14")));
        job.run();

        given(compass.fetch()).willReturn(feed("2027-10-28", compassEvent("compass-cpi", "2026-10-15")));
        job.run();

        assertThat(events.storedDay(LocalDate.parse("2026-10-14"))).isEmpty();
        assertThat(events.storedDay(LocalDate.parse("2026-10-15"))).extracting(Dtos.MarketEvent::id)
                .containsExactly("compass-cpi");
    }

    @Test
    void aFailedFetchFailsTheRunAndKeepsWhatWasStored() {
        given(compass.fetch()).willReturn(feed("2027-10-28", compassEvent("compass-cpi", "2026-10-14")));
        job.run();

        given(compass.fetch()).willThrow(new ProviderException("compass", Kind.UNAVAILABLE, "HTTP 503"));
        assertThatThrownBy(job::run).isInstanceOf(ProviderException.class);

        assertThat(events.storedDay(LocalDate.parse("2026-10-14"))).hasSize(1);
    }
}
