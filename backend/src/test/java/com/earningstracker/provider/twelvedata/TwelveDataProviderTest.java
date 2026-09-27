package com.earningstracker.provider.twelvedata;

import static com.earningstracker.provider.ProviderTestSupport.CLOCK;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.fixture;
import static com.earningstracker.provider.ProviderTestSupport.httpFactory;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import com.earningstracker.market.PriceBar;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TwelveDataProviderTest {

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes().on("/time_series", json("twelvedata/time_series-AAPL.json"));
    private TwelveDataProvider provider;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        provider = new TwelveDataProvider(new TwelveDataProperties("test-key",
                server.url("/").toString().replaceAll("/$", ""), Duration.ofMillis(1), 800), httpFactory(CLOCK), CLOCK);
    }

    @AfterEach
    void stop() {
        server.close();
    }

    @Test
    void parsesDailyBarsOldestFirstAndMapsShareClasses() {
        List<PriceBar> bars = provider.dailyBars("BRK-B", LocalDate.of(2026, 9, 23));

        assertThat(bars).extracting(PriceBar::date).containsExactly(LocalDate.of(2026, 9, 23),
                LocalDate.of(2026, 9, 24), LocalDate.of(2026, 9, 25));
        assertThat(bars.getFirst()).isEqualTo(new PriceBar(LocalDate.of(2026, 9, 23), 341.079987, 341.79999, 335.5,
                337.019989, 31_658_800));
        RecordedRequest request = routes.requests("/time_series").getFirst();
        assertThat(request.getHeaders().get("Authorization")).isEqualTo("apikey test-key");
        assertThat(request.getUrl().queryParameter("symbol")).isEqualTo("BRK.B");
        assertThat(request.getUrl().queryParameter("start_date")).isEqualTo("2026-09-23");
        assertThat(request.getUrl().queryParameter("order")).isEqualTo("ASC");
        assertThat(request.getTarget()).doesNotContain("test-key");
    }

    @Test
    void planRestrictionsAreUnsupportedAndNotRetried() {
        routes.on("/time_series", body(404, fixture("twelvedata/error-plan.json")));

        assertThatThrownBy(() -> provider.dailyBars("AAPL", LocalDate.of(2026, 9, 1)))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNSUPPORTED));
        assertThat(routes.requests()).hasSize(1);
    }

    @Test
    void readsErrorsReportedInsideHttp200Bodies() {
        routes.on("/time_series", body(200, "{\"code\":429,\"message\":\"You have run out of API credits for the "
                + "current minute.\",\"status\":\"error\"}"));

        assertThatThrownBy(() -> provider.dailyBars("AAPL", LocalDate.of(2026, 9, 1)))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.RATE_LIMITED));
        assertThat(routes.requests()).hasSize(3); // retried with backoff
    }

    @Test
    void euSymbolsAreUnsupportedWithoutACall() {
        assertThatThrownBy(() -> provider.dailyBars("SAP.DE", LocalDate.of(2026, 9, 1)))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNSUPPORTED));
        assertThat(routes.requests()).isEmpty();
    }
}
