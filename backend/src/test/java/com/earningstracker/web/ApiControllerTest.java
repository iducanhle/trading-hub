package com.earningstracker.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import com.earningstracker.domain.HistoryCalculator;
import com.earningstracker.jobs.JobRunner;
import com.earningstracker.market.Importance;
import com.earningstracker.market.Region;
import com.earningstracker.notification.DigestService;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.security.TokenVerifier;
import com.earningstracker.service.CalendarService;
import com.earningstracker.service.FollowedEarningsService;
import com.earningstracker.service.MarketEventService;
import com.earningstracker.service.PriceRange;
import com.earningstracker.service.SearchService;
import com.earningstracker.service.StockService;
import com.earningstracker.web.dto.Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiControllerTest {

    @Autowired
    private MockMvcTester mvc;
    @MockitoBean
    private TokenVerifier tokenVerifier;
    @MockitoBean
    private StockService stocks;
    @MockitoBean
    private SearchService search;
    @MockitoBean
    private CalendarService calendar;
    @MockitoBean
    private MarketEventService marketEvents;
    @MockitoBean
    private FollowedEarningsService followed;
    @MockitoBean
    private JobRunner jobs;
    @MockitoBean
    private DigestService digest;

    @BeforeEach
    void signIn() {
        given(tokenVerifier.verify("t")).willReturn(new AuthenticatedUser("uid-1", "me@example.com", true));
    }

    private MockMvcTester.MockMvcRequestBuilder get(String uri) {
        return mvc.get().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer t");
    }

    private MockMvcTester.MockMvcRequestBuilder post(String uri) {
        return mvc.post().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer t");
    }

    private void assertBadRequest(String uri) {
        assertThat(get(uri)).hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.code").isEqualTo("BAD_REQUEST");
    }

    @Test
    void overviewNormalizesTheSymbolAndUsesContractFieldNames() {
        given(stocks.overview("SAP.DE")).willReturn(new Dtos.StockOverview("SAP.DE", "SAP SE", "XETRA", Region.EU, "EUR",
                null, "Technology", null, null, new Dtos.QuoteInfo(185.92, 1.74, 0.94, 184.18,
                        Instant.parse("2026-09-25T15:39:50Z")),
                new Dtos.KeyStats(214.6e9, 244.6e9, 244.3, 127.5, 27.87, 6.67, 2_602_567L),
                new Dtos.Performance(1.2, null, -3.4, 10.0), null, new Dtos.EarningsStats(0, null, null, null),
                Instant.parse("2026-09-27T10:00:00Z"), false));

        assertThat(get("/api/stocks/sap.de")).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"symbol":"SAP.DE","exchange":"XETRA","region":"EU","logoUrl":null,
                 "quote":{"price":185.92,"previousClose":184.18,"asOf":"2026-09-25T15:39:50Z"},
                 "keyStats":{"marketCapUsd":244.6e9,"week52High":244.3,"avgVolume":2602567},
                 "performance":{"w1":1.2,"m1":null,"ytd":-3.4,"y1":10.0},
                 "nextEarnings":null,"earningsStats":{"quartersAnalyzed":0,"streak":null},"stale":false}
                """);
        verify(stocks).overview("SAP.DE");
    }

    @Test
    void trading212AnswersNotConfiguredWithoutAMasterKey() {
        assertThat(get("/api/t212/status")).hasStatus(HttpStatus.SERVICE_UNAVAILABLE).bodyJson()
                .extractingPath("$.code").isEqualTo("T212_NOT_CONFIGURED");
    }

    @Test
    void rejectsUnsupportedSymbols() {
        assertBadRequest("/api/stocks/SAP.F");
        assertBadRequest("/api/stocks/BRK.B/earnings");
        assertBadRequest("/api/stocks/THISSYMBOLISMUCHTOOLONG");
    }

    @Test
    void validatesQueryParameters() {
        assertBadRequest("/api/stocks/AAPL/prices?range=2Y");
        assertBadRequest("/api/stocks/AAPL/history?limit=101");
        assertBadRequest("/api/stocks/AAPL/history?period=YEARLY");
        assertBadRequest("/api/stocks/AAPL/history?before=2026-13-01");
        assertBadRequest("/api/stocks/AAPL/news?limit=0");
        assertThat(mvc.get().uri("/api/search").param("q", " ").header(HttpHeaders.AUTHORIZATION, "Bearer t"))
                .hasStatus(HttpStatus.BAD_REQUEST); // MockMvc would encode a literal %20 in the template
        assertBadRequest("/api/search?q=sap&limit=21");
        assertBadRequest("/api/search");
    }

    @Test
    void passesValidParametersThrough() {
        given(stocks.history(eq("AAPL"), eq(HistoryCalculator.Period.WEEKLY), eq(LocalDate.of(2026, 9, 1)), eq(5)))
                .willReturn(new Dtos.History("WEEKLY", List.of(), null));
        given(stocks.prices(eq("AAPL"), eq(PriceRange.W1))).willReturn(
                new Dtos.Prices("AAPL", "USD", "1W", List.of(), null, List.of(), null, false));

        assertThat(get("/api/stocks/AAPL/history?period=WEEKLY&before=2026-09-01&limit=5")).hasStatusOk()
                .bodyJson().isLenientlyEqualTo("{\"period\":\"WEEKLY\",\"rows\":[],\"nextBefore\":null}");
        assertThat(get("/api/stocks/AAPL/prices?range=1W")).hasStatusOk()
                .bodyJson().extractingPath("$.range").isEqualTo("1W");
    }

    @Test
    void calendarChecksTheRange() {
        assertBadRequest("/api/calendar?from=2026-10-01&to=2026-11-15"); // 46 days
        assertBadRequest("/api/calendar?from=2026-10-10&to=2026-10-01");
        assertBadRequest("/api/calendar?to=2026-10-01");
        assertBadRequest("/api/calendar?from=2026-10-01&to=2026-10-02&region=ASIA");
        assertBadRequest("/api/calendar?from=2026-10-01&to=2026-10-02&minMarketCapUsd=-1");

        given(calendar.calendar(any(), any(), anyDouble(), any(), eq(true), eq("uid-1"))).willReturn(
                new Dtos.Calendar(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 11), List.of()));
        assertThat(get("/api/calendar?from=2026-10-01&to=2026-11-11&followedOnly=true&region=EU")).hasStatusOk();
        verify(calendar).calendar(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 11), 0, CalendarService.RegionFilter.EU,
                true, "uid-1");
    }

    @Test
    void marketEventsChecksTheRangeAndPassesTheFilters() {
        assertBadRequest("/api/market-events?from=2026-10-01&to=2026-11-15"); // 46 days
        assertBadRequest("/api/market-events?from=2026-10-10&to=2026-10-01");
        assertBadRequest("/api/market-events?to=2026-10-01");
        assertBadRequest("/api/market-events?from=2026-10-01&to=2026-10-02&region=ASIA");
        assertBadRequest("/api/market-events?from=2026-10-01&to=2026-10-02&minImportance=HUGE");

        given(marketEvents.events(any(), any(), any(), any(), anyBoolean())).willReturn(
                new Dtos.MarketEvents(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 11), List.of()));
        assertThat(get("/api/market-events?from=2026-10-01&to=2026-11-11&minImportance=MEDIUM&region=OTHER&includeEarnings=false"))
                .hasStatusOk();
        verify(marketEvents).events(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 11), Importance.MEDIUM,
                MarketEventService.EventRegion.OTHER, false);
        assertThat(get("/api/market-events?from=2026-10-01&to=2026-10-02")).hasStatusOk();
        verify(marketEvents).events(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 2), Importance.LOW,
                MarketEventService.EventRegion.ALL, true);
    }

    @Test
    void mapsProviderFailuresToContractErrors() {
        given(stocks.overview("ZZZZ")).willThrow(new ProviderException("providers", Kind.NOT_FOUND, "x"));
        given(stocks.overview("AAPL")).willThrow(new ProviderException("providers", Kind.RATE_LIMITED, "x"));
        given(stocks.overview("MSFT")).willThrow(new ProviderException("providers", Kind.UNAVAILABLE, "x"));

        assertThat(get("/api/stocks/ZZZZ")).hasStatus(HttpStatus.NOT_FOUND)
                .bodyJson().extractingPath("$.code").isEqualTo("SYMBOL_NOT_FOUND");
        assertThat(get("/api/stocks/AAPL")).hasStatus(HttpStatus.TOO_MANY_REQUESTS)
                .bodyJson().extractingPath("$.code").isEqualTo("RATE_LIMITED");
        assertThat(get("/api/stocks/MSFT")).hasStatus(HttpStatus.SERVICE_UNAVAILABLE)
                .bodyJson().extractingPath("$.code").isEqualTo("UPSTREAM_UNAVAILABLE");
    }

    @Test
    void followedEarningsUseTheCallersUid() {
        given(followed.followed("uid-1")).willReturn(new Dtos.FollowedEarnings(List.of(), List.of()));

        assertThat(get("/api/followed/earnings")).hasStatusOk()
                .bodyJson().isLenientlyEqualTo("{\"upcoming\":[],\"noUpcomingDate\":[]}");
    }

    @Test
    void adminTriggerStartsTheJobInTheBackground() {
        given(jobs.trigger("calendar-refresh", "manual")).willReturn(Instant.parse("2026-09-27T10:00:00Z"));

        assertThat(post("/api/admin/jobs/calendar-refresh/run")).hasStatus(HttpStatus.ACCEPTED).bodyJson()
                .isStrictlyEqualTo("{\"jobName\":\"calendar-refresh\",\"startedAt\":\"2026-09-27T10:00:00Z\"}");
    }

    @Test
    void adminTriggerRejectsUnknownJobsAndOtherMethods() {
        given(jobs.trigger("nope", "manual")).willThrow(new ApiException(ErrorCode.BAD_REQUEST, "Unknown job 'nope'"));

        assertThat(post("/api/admin/jobs/nope/run")).hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson().extractingPath("$.code").isEqualTo("BAD_REQUEST");
        assertThat(get("/api/admin/jobs/calendar-refresh/run")).hasStatus(HttpStatus.METHOD_NOT_ALLOWED)
                .bodyJson().extractingPath("$.code").isEqualTo("METHOD_NOT_ALLOWED");
    }

    @Test
    void testEmailNeedsMailSettings() {
        given(digest.isConfigured()).willReturn(false);

        assertThat(post("/api/notifications/test")).hasStatus(HttpStatus.SERVICE_UNAVAILABLE)
                .bodyJson().extractingPath("$.code").isEqualTo("UPSTREAM_UNAVAILABLE");
    }

    @Test
    void everyEndpointNeedsAToken() {
        for (String uri : List.of("/api/search?q=sap", "/api/stocks/AAPL", "/api/calendar?from=2026-10-01&to=2026-10-02",
                "/api/followed/earnings")) {
            assertThat(mvc.get().uri(uri)).hasStatus(HttpStatus.UNAUTHORIZED);
        }
        for (String uri : List.of("/api/notifications/test", "/api/admin/jobs/calendar-refresh/run")) {
            assertThat(mvc.post().uri(uri)).hasStatus(HttpStatus.UNAUTHORIZED);
        }
        given(search.results(anyString(), anyInt())).willReturn(List.of());
        assertThat(get("/api/search?q=sap")).hasStatusOk();
    }
}
