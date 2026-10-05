package com.earningstracker.provider.alpaca;

import static com.earningstracker.provider.ProviderTestSupport.CLOCK;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.httpFactory;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.time.Period;
import java.util.List;

import com.earningstracker.market.IntradayBar;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AlpacaProviderTest {

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes().on("/v2/stocks/", json("alpaca/bars-AAPL.json"));
    private AlpacaProvider provider;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        provider = new AlpacaProvider(new AlpacaProperties("test-id", "test-secret",
                server.url("/").toString().replaceAll("/$", ""), Duration.ofMillis(1)), httpFactory(CLOCK), CLOCK);
    }

    @AfterEach
    void stop() {
        server.close();
    }

    @Test
    void latestSessionKeepsOnlyTheLastTradingDayAndSendsKeysInHeaders() {
        List<IntradayBar> bars = provider.intradayBars("BRK-B", Duration.ofMinutes(5), Period.ZERO);

        assertThat(bars).extracting(IntradayBar::time).containsExactly(Instant.parse("2026-09-25T13:30:00Z"),
                Instant.parse("2026-09-25T13:35:00Z"));
        assertThat(bars.getFirst()).isEqualTo(new IntradayBar(Instant.parse("2026-09-25T13:30:00Z"), 252.0, 252.6,
                251.8, 252.4, 58_100));
        RecordedRequest request = routes.requests().getFirst();
        assertThat(request.getUrl().encodedPath()).isEqualTo("/v2/stocks/BRK.B/bars");
        assertThat(request.getUrl().queryParameter("timeframe")).isEqualTo("5Min");
        assertThat(request.getUrl().queryParameter("feed")).isEqualTo("iex");
        assertThat(request.getHeaders().get("APCA-API-KEY-ID")).isEqualTo("test-id");
        assertThat(request.getHeaders().get("APCA-API-SECRET-KEY")).isEqualTo("test-secret");
        assertThat(request.getTarget()).doesNotContain("test-id").doesNotContain("test-secret");
    }

    @Test
    void longerRangesKeepEveryBarAndFollowPages() {
        routes.on("/v2/stocks/", request -> request.getUrl().queryParameter("page_token") != null
                ? json("alpaca/bars-AAPL.json")
                : body(200, "{\"bars\":[{\"t\":\"2026-09-24T14:00:00Z\",\"o\":1,\"h\":2,\"l\":1,\"c\":2,\"v\":5}],"
                        + "\"next_page_token\":\"abc+=\"}"));

        List<IntradayBar> bars = provider.intradayBars("AAPL", Duration.ofHours(1), Period.ofWeeks(1));

        assertThat(bars).hasSize(4);
        assertThat(routes.requests()).hasSize(2);
        assertThat(routes.requests().getFirst().getUrl().queryParameter("timeframe")).isEqualTo("1Hour");
        assertThat(routes.requests().get(1).getUrl().queryParameter("page_token")).isEqualTo("abc+=");
    }

    @Test
    void forbiddenIsUnsupported() {
        routes.on("/v2/stocks/", body(403, "{\"message\":\"forbidden\"}"));

        assertThatThrownBy(() -> provider.intradayBars("AAPL", Duration.ofMinutes(5), Period.ZERO))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNSUPPORTED));
    }

    @Test
    void euSymbolsAreUnsupportedWithoutACall() {
        assertThatThrownBy(() -> provider.intradayBars("SAP.DE", Duration.ofMinutes(5), Period.ZERO))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNSUPPORTED));
        assertThat(routes.requests()).isEmpty();
    }

    @Test
    void timeframes() {
        assertThat(AlpacaProvider.timeframe(Duration.ofMinutes(1))).isEqualTo("1Min");
        assertThat(AlpacaProvider.timeframe(Duration.ofMinutes(30))).isEqualTo("30Min");
        assertThat(AlpacaProvider.timeframe(Duration.ofHours(1))).isEqualTo("1Hour");
    }
}
