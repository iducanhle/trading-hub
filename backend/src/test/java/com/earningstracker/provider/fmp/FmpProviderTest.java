package com.earningstracker.provider.fmp;

import static com.earningstracker.provider.ProviderTestSupport.CLOCK;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.httpFactory;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.ReportTime;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FmpProviderTest {

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes().on("/earnings", json("fmp/earnings-AAPL.json"));
    private FmpProvider provider;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        provider = new FmpProvider(new FmpProperties("test-key", server.url("/").toString().replaceAll("/$", ""),
                Duration.ofMillis(1), 250), httpFactory(CLOCK), CLOCK);
    }

    @AfterEach
    void stop() {
        server.close();
    }

    @Test
    void parsesReportsWithRevenueAndKeepsTheKeyOutOfTheUrl() {
        List<EarningsReport> reports = provider.earnings("AAPL");

        assertThat(reports).hasSize(5);
        EarningsReport upcoming = reports.getFirst();
        assertThat(upcoming.date()).isEqualTo(LocalDate.of(2026, 10, 29));
        assertThat(upcoming.time()).isEqualTo(ReportTime.UNKNOWN);
        assertThat(upcoming.epsEstimate()).isEqualTo(1.99);
        assertThat(upcoming.epsActual()).isNull();
        assertThat(upcoming.revenueEstimate()).isEqualTo(113_210_600_000.0);
        assertThat(reports.get(1).revenueActual()).isEqualTo(109_417_000_000.0);
        RecordedRequest request = routes.requests("/earnings").getFirst();
        assertThat(request.getHeaders().get("apikey")).isEqualTo("test-key");
        assertThat(request.getTarget()).doesNotContain("test-key");
    }

    @Test
    void premiumSymbolsAreUnsupported() {
        routes.on("/earnings", body(402, "Premium Query Parameter: 'Special Endpoint : This value set for 'symbol' is "
                + "not available under your current subscription"));

        assertThatThrownBy(() -> provider.earnings("BRK-B"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNSUPPORTED));
        assertThatThrownBy(() -> provider.earnings("SAP.DE"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNSUPPORTED));
    }
}
