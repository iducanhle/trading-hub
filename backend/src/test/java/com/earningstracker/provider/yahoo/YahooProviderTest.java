package com.earningstracker.provider.yahoo;

import static com.earningstracker.provider.ProviderTestSupport.CLOCK;
import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.fixture;
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
import java.util.concurrent.atomic.AtomicInteger;

import com.earningstracker.market.CompanyProfile;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.NewsArticle;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Quote;
import com.earningstracker.market.RecommendationTrend;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class YahooProviderTest {

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes()
            .on("/fc", new MockResponse.Builder().code(404).addHeader("Set-Cookie", "A3=session-cookie; Path=/")
                    .body("not found").build())
            .on("/q1/v1/test/getcrumb", new MockResponse.Builder().code(200).body("crumb-1").build())
            .on("/q2/v1/finance/search", json("yahoo/search-sap.json"))
            .on("/q1/v8/finance/chart/AZN.L", json("yahoo/chart-AZN.L.json"))
            .on("/q1/v8/finance/chart/AAPL", json("yahoo/chart-AAPL.json"))
            .on("/q1/v8/finance/chart/EURUSD", json("yahoo/chart-EURUSD=X.json"))
            .on("/q2/v10/finance/quoteSummary/AZN.L", json("yahoo/quoteSummary-AZN.L.json"))
            .on("/q2/v10/finance/quoteSummary/SAP.DE", json("yahoo/quoteSummary-SAP.DE.json"))
            .on("/q2/v10/finance/quoteSummary/CEZ.PR", json("yahoo/quoteSummary-CEZ.PR.json"))
            .on("/q1/v1/finance/visualization", request -> {
                String query = request.getBody().utf8();
                if (query.contains("SAP.DE")) {
                    return json("yahoo/sp-earnings-SAP.DE.json");
                }
                return query.contains("CEZ.PR") ? json("yahoo/sp-earnings-CEZ.PR.json") : body(500, "down");
            })
            .on("/q2/v6/finance/recommendationsbysymbol/SAP.DE", json("yahoo/peers-SAP.DE.json"))
            .on("/q2/v7/finance/quote", json("yahoo/quote-batch.json"))
            .on("/rss", new MockResponse.Builder().code(200).addHeader("Content-Type", "application/rss+xml")
                    .body(fixture("yahoo/rss-SAP.DE.xml")).build());
    private YahooProvider provider;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        String base = server.url("/").toString().replaceAll("/$", "");
        provider = new YahooProvider(new YahooProperties(base + "/q1", base + "/q2", base + "/fc", base + "/consent",
                base + "/v2/collectConsent", base + "/copyConsent", base + "/rss", "test-agent", Duration.ofMillis(1)),
                httpFactory(CLOCK), JSON, CLOCK);
    }

    @AfterEach
    void stop() {
        server.close();
    }

    @Test
    void directSessionSendsTheCookieAndTheCrumb() {
        provider.profile("SAP.DE");

        assertThat(routes.requests("/q1/v1/test/getcrumb").getFirst().getHeaders().get("Cookie"))
                .contains("A3=session-cookie");
        RecordedRequest summary = routes.requests("/q2/v10/finance/quoteSummary").getFirst();
        assertThat(summary.getUrl().queryParameter("crumb")).isEqualTo("crumb-1");
        assertThat(summary.getHeaders().get("Cookie")).contains("A3=session-cookie");
        assertThat(summary.getHeaders().get("User-Agent")).isEqualTo("test-agent");
        assertThat(routes.requests("/consent")).isEmpty();
    }

    @Test
    void fallsBackToTheConsentFlowAndDeclines() {
        routes.on("/q1/v1/test/getcrumb", body(404, "{}"))
                .on("/consent", new MockResponse.Builder().code(200).body(fixture("yahoo/consent-form.html")).build())
                .on("/v2/collectConsent", new MockResponse.Builder().code(200).body("ok").build())
                .on("/copyConsent", new MockResponse.Builder().code(200).body("ok").build())
                .on("/q2/v1/test/getcrumb", new MockResponse.Builder().code(200).body("crumb-2").build());

        provider.profile("SAP.DE");

        String form = routes.requests("/v2/collectConsent").getFirst().getBody().utf8();
        assertThat(form).contains("reject=reject", "csrfToken=csrf-123", "sessionId=session-456").doesNotContain("agree");
        assertThat(routes.requests("/copyConsent").getFirst().getUrl().queryParameter("sessionId"))
                .isEqualTo("session-456");
        assertThat(routes.requests("/q2/v10/finance/quoteSummary").getFirst().getUrl().queryParameter("crumb"))
                .isEqualTo("crumb-2");
    }

    @Test
    void renewsTheSessionOnceWhenTheCrumbIsRejected() {
        AtomicInteger calls = new AtomicInteger();
        routes.on("/q2/v10/finance/quoteSummary/SAP.DE", request -> calls.incrementAndGet() == 1
                ? body(401, "{\"finance\":{\"error\":{\"code\":\"Unauthorized\",\"description\":\"Invalid Crumb\"}}}")
                : json("yahoo/quoteSummary-SAP.DE.json"));

        assertThat(provider.profile("SAP.DE").name()).isEqualTo("SAP SE");
        assertThat(routes.requests("/q1/v1/test/getcrumb")).hasSize(2);
    }

    @Test
    void searchFiltersListingsByRegion() {
        assertThat(provider.search("sap", Region.EU, 10))
                .containsExactly(new SymbolMatch("SAP.DE", "SAP SE", Exchange.XETRA, "EUR"));
        assertThat(provider.search("sap", Region.US, 10))
                .containsExactly(new SymbolMatch("SAP", "SAP SE", Exchange.NYSE, "USD"));
        RecordedRequest eu = routes.requests("/q2/v1/finance/search").getFirst();
        assertThat(eu.getUrl().queryParameter("region")).isEqualTo("DE");
        assertThat(eu.getUrl().queryParameter("lang")).isEqualTo("de-DE");
    }

    @Test
    void searchSkipsResultsWithoutAnExchange() {
        routes.on("/q2/v1/finance/search", body(200, "{\"quotes\":[{\"symbol\":\"ABCD\",\"quoteType\":\"EQUITY\","
                + "\"shortname\":\"No exchange\"},{\"symbol\":\"SAP\",\"quoteType\":\"EQUITY\",\"exchange\":\"NYQ\","
                + "\"longname\":\"SAP SE\"}]}"));

        assertThat(provider.search("sap", Region.US, 10)).extracting(SymbolMatch::symbol).containsExactly("SAP");
    }

    @Test
    void quoteNormalizesPenceToPounds() {
        Quote quote = provider.quote("AZN.L");

        assertThat(quote.price()).isEqualTo(125.52);
        assertThat(quote.previousClose()).isEqualTo(124.0);
        assertThat(quote.change()).isCloseTo(1.52, within(1e-9));
        assertThat(quote.currency()).isEqualTo("GBP");
        assertThat(quote.asOf()).isEqualTo(Instant.ofEpochSecond(1790351140));
    }

    @Test
    void dailyBarsUseExchangeDatesSkipIncompleteRowsAndNormalizePence() {
        List<PriceBar> azn = provider.dailyBars("AZN.L", LocalDate.of(2026, 9, 1));
        assertThat(azn).extracting(PriceBar::date).containsExactly(LocalDate.of(2026, 9, 23),
                LocalDate.of(2026, 9, 24), LocalDate.of(2026, 9, 25));
        assertThat(azn.getLast().close()).isEqualTo(125.52);

        List<PriceBar> aapl = provider.dailyBars("AAPL", LocalDate.of(2026, 9, 1));
        assertThat(aapl).extracting(PriceBar::date).containsExactly(LocalDate.of(2026, 9, 24), LocalDate.of(2026, 9, 25));
        RecordedRequest request = routes.requests("/q1/v8/finance/chart/AAPL").getFirst();
        assertThat(request.getUrl().queryParameter("period1")).isEqualTo("1788220800"); // 2026-09-01T00:00Z
        assertThat(request.getUrl().queryParameter("interval")).isEqualTo("1d");
    }

    @Test
    void profileKeepsMarketCapAndEpsInPoundsButConvertsPenceRanges() {
        CompanyProfile profile = provider.profile("AZN.L");

        assertThat(profile.exchange()).isEqualTo(Exchange.LSE);
        assertThat(profile.currency()).isEqualTo("GBP");
        assertThat(profile.financialCurrency()).isEqualTo("USD");
        assertThat(profile.marketCap()).isEqualTo(194_667_184_128.0);
        assertThat(profile.epsTtm()).isEqualTo(5.01);
        assertThat(profile.week52High()).isEqualTo(157.32);
        assertThat(profile.week52Low()).isEqualTo(98.92);
        assertThat(profile.peRatio()).isEqualTo(25.05389);
        assertThat(profile.avgVolume()).isEqualTo(3_362_622L);
        assertThat(profile.sector()).isEqualTo("Healthcare");
        assertThat(profile.website()).isEqualTo("https://www.astrazeneca.com");
        assertThat(profile.logoUrl()).isNull();
    }

    @Test
    void usListingsOutsideSupportedExchangesAreNotFound() {
        routes.on("/q2/v10/finance/quoteSummary/SAPGF", body(200,
                "{\"quoteSummary\":{\"result\":[{\"price\":{\"exchange\":\"PNK\",\"currency\":\"USD\",\"longName\":\"SAP\"}}]}}"));

        assertThatThrownBy(() -> provider.profile("SAPGF"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.NOT_FOUND));
        assertThatThrownBy(() -> provider.quote("ZZZZQX.DE"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.NOT_FOUND));
    }

    @Test
    void earningsMergeReportDatesWithQuarterData() {
        List<EarningsReport> reports = provider.earnings("SAP.DE");

        assertThat(reports).hasSize(6);
        EarningsReport next = report(reports, "2026-10-21");
        assertThat(next.time()).isEqualTo(ReportTime.UNKNOWN);
        assertThat(next.fiscalQuarter()).isEqualTo(3);
        assertThat(next.fiscalYear()).isEqualTo(2026);
        assertThat(next.epsEstimate()).isEqualTo(1.83);
        assertThat(next.revenueEstimate()).isEqualTo(10_088_648_850.0);
        assertThat(next.dateConfirmed()).isTrue();
        assertThat(next.periodEnd()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(next.currency()).isEqualTo("EUR");

        EarningsReport q1 = report(reports, "2026-04-23");
        assertThat(q1.time()).isEqualTo(ReportTime.AMC);
        assertThat(q1.epsActual()).isEqualTo(1.72);
        assertThat(q1.revenueActual()).isEqualTo(9_555_000_000.0);
        assertThat(q1.periodEnd()).isEqualTo(LocalDate.of(2026, 3, 31));
        assertThat(report(reports, "2026-01-29").time()).isEqualTo(ReportTime.BMO);
        EarningsReport dateOnly = report(reports, "2026-07-23");
        assertThat(dateOnly.time()).isEqualTo(ReportTime.UNKNOWN);
        assertThat(dateOnly.revenueActual()).isEqualTo(9_877_000_000.0);
        assertThat(report(reports, "2025-07-22").revenueActual()).isNull(); // older than financialsChart's 4 quarters

        RecordedRequest query = routes.requests("/q1/v1/finance/visualization").getFirst();
        assertThat(query.getBody().utf8()).contains("\"sp_earnings\"", "\"SAP.DE\"");
        assertThat(query.getUrl().queryParameter("crumb")).isEqualTo("crumb-1");
    }

    @Test
    void earningsTreatZeroEstimatesAsMissing() {
        List<EarningsReport> reports = provider.earnings("CEZ.PR");

        EarningsReport next = report(reports, "2026-11-12");
        assertThat(next.epsEstimate()).isNull();
        assertThat(next.revenueEstimate()).isNull(); // Yahoo sends 0
        assertThat(next.dateConfirmed()).isTrue();
        EarningsReport march = report(reports, "2026-03-12");
        assertThat(march.time()).isEqualTo(ReportTime.BMO);
        assertThat(march.periodEnd()).isEqualTo(LocalDate.of(2025, 12, 31));
        assertThat(march.revenueActual()).isEqualTo(92_986_000_000.0);
        assertThat(report(reports, "2025-08-06").time()).isEqualTo(ReportTime.UNKNOWN);
    }

    @Test
    void earningsFallBackToQuoteSummaryWhenReportDatesAreUnavailable() {
        List<EarningsReport> reports = provider.earnings("AZN.L");

        assertThat(reports).hasSize(5);
        EarningsReport next = report(reports, "2026-10-30");
        assertThat(next.currency()).isEqualTo("USD");
        assertThat(next.epsEstimate()).isEqualTo(2.62517);
        assertThat(next.revenueEstimate()).isEqualTo(16_074_571_160.0);
        assertThat(reports).filteredOn(r -> r.date() == null).extracting(EarningsReport::periodEnd)
                .containsExactly(LocalDate.of(2025, 9, 30), LocalDate.of(2025, 12, 31), LocalDate.of(2026, 3, 31),
                        LocalDate.of(2026, 6, 30));
    }

    @Test
    void recommendationsResolveMonthOffsets() {
        List<RecommendationTrend> trends = provider.recommendations("SAP.DE");

        assertThat(trends).extracting(RecommendationTrend::period).containsExactly(YearMonth.of(2026, 9),
                YearMonth.of(2026, 8), YearMonth.of(2026, 7), YearMonth.of(2026, 6));
        assertThat(trends.getFirst()).isEqualTo(new RecommendationTrend(YearMonth.of(2026, 9), 3, 21, 4, 0, 0));
    }

    @Test
    void newsComesFromTheRssFeed() {
        List<NewsArticle> news = provider.news("SAP.DE", 2);

        assertThat(news).hasSize(2);
        assertThat(news.getFirst().headline()).isEqualTo("Sample headline 1 & more");
        assertThat(news.getFirst().source()).isEqualTo("Yahoo Finance");
        assertThat(news.getFirst().publishedAt()).isEqualTo(Instant.parse("2026-09-25T21:50:39Z"));
        assertThat(news.getFirst().summary()).isEqualTo("Sample summary 1");
        assertThat(news.getFirst().imageUrl()).isNull();
        assertThat(routes.requests("/rss").getFirst().getUrl().queryParameter("s")).isEqualTo("SAP.DE");
    }

    @Test
    void peersFxAndBatchValidation() {
        assertThat(provider.peers("SAP.DE")).containsExactly("SIE.DE", "ALV.DE", "BAS.DE", "DTE.DE", "BAYN.DE");
        assertThat(provider.usdPerUnit("EUR")).isEqualTo(1.1401);
        assertThat(provider.existingSymbols(List.of("AAPL", "SAP.DE", "AZN.L", "CEZ.PR", "NOPE123.DE", "VOLV-B.ST")))
                .containsExactlyInAnyOrder("AAPL", "SAP.DE", "AZN.L", "CEZ.PR", "VOLV-B.ST");
        assertThat(routes.requests("/q2/v7/finance/quote").getFirst().getUrl().queryParameter("symbols"))
                .isEqualTo("AAPL,SAP.DE,AZN.L,CEZ.PR,NOPE123.DE,VOLV-B.ST");
    }

    private static EarningsReport report(List<EarningsReport> reports, String date) {
        return reports.stream().filter(r -> LocalDate.parse(date).equals(r.date())).findFirst().orElseThrow();
    }
}
