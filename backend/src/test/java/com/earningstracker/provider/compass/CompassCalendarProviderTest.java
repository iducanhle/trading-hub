package com.earningstracker.provider.compass;

import static com.earningstracker.provider.ProviderTestSupport.CLOCK;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.httpFactory;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.earningstracker.market.EventCategory;
import com.earningstracker.market.Importance;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import com.earningstracker.web.dto.Dtos;
import mockwebserver3.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CompassCalendarProviderTest {

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes().on("/calendar.json", json("compass/calendar.json"));
    private CompassCalendarProvider provider;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        provider = new CompassCalendarProvider(new CompassProperties(server.url("/").toString().replaceAll("/$", ""),
                Duration.ofMillis(1)), httpFactory(CLOCK));
    }

    @AfterEach
    void stop() {
        server.close();
    }

    @Test
    void mapsTheFeedAndSkipsEntriesWithoutAnImpact() {
        CompassCalendarProvider.Feed feed = provider.fetch();

        assertThat(feed.windowStart()).isEqualTo(LocalDate.of(2026, 9, 27));
        assertThat(feed.windowEnd()).isEqualTo(LocalDate.of(2027, 10, 28));
        Map<String, Dtos.MarketEvent> byId = feed.events().stream()
                .collect(Collectors.toMap(Dtos.MarketEvent::id, Function.identity()));
        assertThat(byId).hasSize(6).doesNotContainKey("compass-broken");

        Dtos.MarketEvent cpi = byId.get("compass-fred-cpi-2026-10-14");
        assertThat(cpi.date()).isEqualTo(LocalDate.of(2026, 10, 14));
        assertThat(cpi.startsAt()).isEqualTo(Instant.parse("2026-10-14T12:30:00Z"));
        assertThat(cpi.allDay()).isFalse();
        assertThat(cpi.label()).isEqualTo("CPI");
        assertThat(cpi.category()).isEqualTo(EventCategory.INFLATION);
        assertThat(cpi.importance()).isEqualTo(Importance.HIGH);
        assertThat(cpi.country()).isEqualTo("US");
        assertThat(cpi.moveRatio()).isEqualTo(1.22);
        assertThat(cpi.sourceUrl()).startsWith("https://fred.stlouisfed.org");

        Dtos.MarketEvent holiday = byId.get("compass-market-holiday-2026-11-26");
        assertThat(holiday.allDay()).isTrue();
        assertThat(holiday.startsAt()).isNull();
        assertThat(holiday.category()).isEqualTo(EventCategory.MARKET_STRUCTURE);
        assertThat(holiday.importance()).isEqualTo(Importance.LOW);

        Dtos.MarketEvent unknown = byId.get("compass-weird");
        assertThat(unknown.label()).isEqualTo("Something New");
        assertThat(unknown.category()).isEqualTo(EventCategory.MARKET_STRUCTURE);
        assertThat(unknown.moveRatio()).isNull();
    }

    @Test
    void rejectsAResponseThatIsNotACalendar() {
        routes.on("/calendar.json", body(200, "{\"hello\":1}"));

        assertThatThrownBy(provider::fetch).isInstanceOf(ProviderException.class)
                .extracting(e -> ((ProviderException) e).kind()).isEqualTo(Kind.BAD_RESPONSE);
    }
}
