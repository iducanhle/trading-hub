package com.earningstracker.provider.finnhub;

import static com.earningstracker.provider.ProviderTestSupport.CLOCK;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.httpFactory;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import com.earningstracker.market.CompanyProfile;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.NewsArticle;
import com.earningstracker.market.Quote;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FinnhubProviderTest {

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes()
            .on("/stock/symbol", json("finnhub/symbol-directory.json"))
            .on("/search", json("finnhub/search-apple.json"))
            .on("/quote", json("finnhub/quote-AAPL.json"))
            .on("/stock/profile2", json("finnhub/profile2-AAPL.json"))
            .on("/stock/metric", json("finnhub/metric-AAPL.json"))
            .on("/calendar/earnings", request -> request.getUrl().queryParameter("symbol") != null
                    ? json("finnhub/calendar-AAPL.json")
                    : json("finnhub/calendar-window.json"))
            .on("/stock/earnings", json("finnhub/earnings-AAPL.json"))
            .on("/stock/recommendation", json("finnhub/recommendation-AAPL.json"))
            .on("/company-news", json("finnhub/news-AAPL.json"))
            .on("/stock/peers", json("finnhub/peers-AAPL.json"));
    private FinnhubProvider provider;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        provider = new FinnhubProvider(new FinnhubProperties("test-key", baseUrl(), Duration.ofMillis(1)),
                httpFactory(CLOCK), CLOCK);
    }

    @AfterEach
    void stop() {
        server.close();
    }

    private String baseUrl() {
        return server.url("/").toString().replaceAll("/$", "");
    }

    @Test
    void searchKeepsEquitiesOnSupportedUsExchangesAndSendsTheKeyAsHeader() {
        List<SymbolMatch> matches = provider.search("apple", Region.US, 10);

        assertThat(matches).containsExactly(new SymbolMatch("AAPL", "Apple Inc", Exchange.NASDAQ, "USD"));
        RecordedRequest search = routes.requests("/search").getFirst();
        assertThat(search.getHeaders().get("X-Finnhub-Token")).isEqualTo("test-key");
        assertThat(search.getUrl().queryParameter("exchange")).isEqualTo("US");
        assertThat(search.getTarget()).doesNotContain("test-key");
        assertThat(provider.search("apple", Region.EU, 10)).isEmpty();
    }

    @Test
    void quoteMapsFinnhubFields() {
        Quote quote = provider.quote("AAPL");

        assertThat(quote.price()).isEqualTo(341.07);
        assertThat(quote.previousClose()).isEqualTo(335.92);
        assertThat(quote.change()).isCloseTo(5.15, within(1e-9));
        assertThat(quote.changePercent()).isCloseTo(1.5331, within(1e-4));
        assertThat(quote.currency()).isEqualTo("USD");
        assertThat(quote.asOf()).isEqualTo(Instant.ofEpochSecond(1790366400));
    }

    @Test
    void quoteWithoutPriceIsNotFoundAndEuSymbolsAreUnsupported() {
        routes.on("/quote", body(200, "{\"c\":0,\"d\":null,\"dp\":null,\"h\":0,\"l\":0,\"o\":0,\"pc\":0,\"t\":0}"));

        assertThatThrownBy(() -> provider.quote("ZZZZ"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.NOT_FOUND));
        assertThatThrownBy(() -> provider.quote("SAP.DE"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNSUPPORTED));
        assertThat(routes.requests("/quote")).hasSize(1);
    }

    @Test
    void profileScalesMillionsAndTakesTheExchangeFromTheDirectory() {
        CompanyProfile profile = provider.profile("AAPL");

        assertThat(profile.name()).isEqualTo("Apple Inc");
        assertThat(profile.exchange()).isEqualTo(Exchange.NASDAQ);
        assertThat(profile.marketCap()).isCloseTo(4_977_637_064_987.0, within(1.0));
        assertThat(profile.avgVolume()).isEqualTo(51_878_370L);
        assertThat(profile.week52High()).isEqualTo(345.34);
        assertThat(profile.peRatio()).isEqualTo(38.6073);
        assertThat(profile.epsTtm()).isCloseTo(8.7233, within(1e-4));
        assertThat(profile.industry()).isEqualTo("Technology");
        assertThat(profile.sector()).isNull();
        assertThat(profile.logoUrl()).startsWith("https://");
        assertThat(profile.website()).isEqualTo("https://www.apple.com/");
    }

    @Test
    void anAdrResolvedToItsHomeListingIsNotFound() {
        routes.on("/stock/profile2", body(200, """
                {"ticker":"000660.KS","name":"SK Hynix Inc","currency":"KRW",
                 "exchange":"KOREA EXCHANGE (STOCK MARKET)","marketCapitalization":150000000}
                """));

        assertThatThrownBy(() -> provider.profile("SKHY"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.NOT_FOUND));
    }

    @Test
    void profileSurvivesMissingMetrics() {
        routes.on("/stock/metric", body(500, "down"));

        CompanyProfile profile = provider.profile("AAPL");

        assertThat(profile.marketCap()).isNotNull();
        assertThat(profile.peRatio()).isNull();
        assertThat(profile.avgVolume()).isNull();
    }

    @Test
    void earningsAreThePerSymbolCalendar() {
        List<EarningsReport> reports = provider.earnings("AAPL");

        assertThat(reports).hasSize(3);
        EarningsReport next = reports.stream().filter(r -> LocalDate.of(2026, 10, 28).equals(r.date())).findFirst()
                .orElseThrow();
        assertThat(next.time()).isEqualTo(ReportTime.AMC);
        assertThat(next.fiscalQuarter()).isEqualTo(4);
        assertThat(next.fiscalYear()).isEqualTo(2026);
        assertThat(next.revenueEstimate()).isEqualTo(115_327_453_620.0);
        RecordedRequest calendar = routes.requests("/calendar/earnings").getFirst();
        assertThat(calendar.getUrl().queryParameter("from")).isEqualTo("2025-09-27");
        assertThat(calendar.getUrl().queryParameter("to")).isEqualTo("2027-09-27");
    }

    @Test
    void epsSurprisesAreASeparateLowerRankedProviderWithoutReportDates() {
        FinnhubEpsProvider eps = new FinnhubEpsProvider(provider);

        List<EarningsReport> reports = eps.earnings("AAPL");

        assertThat(eps.id()).isEqualTo("finnhub-eps");
        assertThat(reports).hasSize(4).allMatch(r -> r.date() == null);
        EarningsReport latest = reports.getFirst();
        assertThat(latest.periodEnd()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(latest.fiscalQuarter()).isEqualTo(3);
        assertThat(latest.fiscalYear()).isEqualTo(2026);
        assertThat(latest.epsActual()).isEqualTo(1.91);
    }

    @Test
    void calendarMapsReportHoursAndDropsOtcSymbols() {
        List<EarningsReport> reports = provider.calendar(LocalDate.of(2026, 9, 18), LocalDate.of(2026, 9, 18));

        assertThat(reports).extracting(EarningsReport::symbol).containsExactly("AAPL", "BRK-B", "TSM");
        assertThat(reports).extracting(EarningsReport::time)
                .containsExactly(ReportTime.BMO, ReportTime.AMC, ReportTime.UNKNOWN);
        assertThat(reports.getFirst().epsActual()).isEqualTo(-8.75);
        assertThat(reports.getFirst().currency()).isEqualTo("USD");
    }

    @Test
    void recommendationsAreNewestFirst() {
        assertThat(provider.recommendations("AAPL")).extracting(r -> r.period())
                .containsExactly(YearMonth.of(2026, 9), YearMonth.of(2026, 8), YearMonth.of(2026, 7),
                        YearMonth.of(2026, 6));
    }

    @Test
    void newsIsSortedLimitedAndBlankFieldsBecomeNull() {
        List<NewsArticle> news = provider.news("AAPL", 3);

        assertThat(news).extracting(NewsArticle::headline)
                .containsExactly("Sample headline 1", "Sample headline 2", "Sample headline 3");
        assertThat(news.get(1).imageUrl()).isNull();
        assertThat(news.get(2).summary()).isNull();
        assertThat(provider.news("AAPL", 1)).hasSize(1);
    }

    @Test
    void peersExcludeTheSymbolAndUnsupportedListings() {
        routes.on("/stock/symbol", body(200, "[{\"symbol\":\"DELL\",\"mic\":\"XNYS\",\"type\":\"Common Stock\"},"
                + "{\"symbol\":\"HPQ\",\"mic\":\"XNYS\",\"type\":\"Common Stock\"},"
                + "{\"symbol\":\"SNDK\",\"mic\":\"XNAS\",\"type\":\"Common Stock\"},"
                + "{\"symbol\":\"AAPL\",\"mic\":\"XNAS\",\"type\":\"Common Stock\"}]"));

        assertThat(provider.peers("AAPL")).containsExactly("DELL", "SNDK", "HPQ");
    }

    @Test
    void isDisabledWithoutApiKey() {
        FinnhubProvider noKey = new FinnhubProvider(new FinnhubProperties("", baseUrl(), Duration.ofMillis(1)),
                httpFactory(CLOCK), CLOCK);

        assertThat(noKey.isEnabled()).isFalse();
    }
}
