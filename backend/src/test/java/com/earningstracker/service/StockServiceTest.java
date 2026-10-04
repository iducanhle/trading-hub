package com.earningstracker.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.domain.EarningsResult;
import com.earningstracker.domain.HistoryCalculator;
import com.earningstracker.market.CompanyProfile;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.IntradayBar;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Quote;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderTestSupport;
import com.earningstracker.web.dto.Dtos;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StockServiceTest {

    private static final String SAP = "SAP.DE";
    private final ServiceFixture f = new ServiceFixture();

    static EarningsReport report(String symbol, String date, ReportTime time, Integer quarter, Double estimate,
            Double actual) {
        return new EarningsReport(symbol, LocalDate.parse(date), time, null, quarter, quarter == null ? null : 2026,
                "EUR", estimate, actual, null, null, null);
    }

    @BeforeEach
    void seed() {
        f.provider.profiles.put(SAP, new CompanyProfile(SAP, "SAP SE", Exchange.XETRA, "EUR", "EUR", "Technology",
                "Software", "https://www.sap.com", "https://logos.example/sap.png", "Germany", 214.6e9, 244.3, 127.5, 27.87, 6.67, 2_602_567L));
        f.provider.quotes.put(SAP, Quote.of(SAP, 185.92, 184.18, "EUR", Instant.parse("2026-09-25T15:39:50Z"), 1_888_918L));
        f.provider.bars.put(SAP, ServiceFixture.weekdays("2021-09-20", "2026-09-25"));
        f.provider.earnings.put(SAP, List.of(
                new EarningsReport(SAP, LocalDate.of(2026, 10, 21), ReportTime.UNKNOWN, LocalDate.of(2026, 9, 30), 3, 2026,
                        "EUR", 1.83, null, 10.09e9, null, true),
                report(SAP, "2026-07-23", ReportTime.UNKNOWN, null, 1.75, 1.59),
                report(SAP, "2026-04-23", ReportTime.AMC, null, 1.66, 1.72),
                report(SAP, "2026-01-29", ReportTime.BMO, null, 1.51, 1.62)));
    }

    @Test
    void overviewCombinesProfileQuotePerformanceAndEarnings() {
        Dtos.StockOverview overview = f.stocks.overview(SAP);

        assertThat(overview.name()).isEqualTo("SAP SE");
        assertThat(overview.exchange()).isEqualTo("XETRA");
        assertThat(overview.region()).isEqualTo(Region.EU);
        assertThat(overview.logoUrl()).isEqualTo("https://logos.example/sap.png");
        assertThat(overview.keyStats().marketCapUsd()).isCloseTo(214.6e9 * 1.14, within(1.0));
        assertThat(overview.quote().price()).isEqualTo(185.92);
        assertThat(overview.performance().w1()).isNotNull();
        assertThat(overview.performance().ytd()).isNotNull();
        assertThat(overview.nextEarnings().date()).isEqualTo(LocalDate.of(2026, 10, 21));
        assertThat(overview.nextEarnings().fiscalQuarter()).isEqualTo(3);
        assertThat(overview.nextEarnings().revenueEstimate()).isEqualTo(10.09e9);
        assertThat(overview.earningsStats().quartersAnalyzed()).isEqualTo(3);
        assertThat(overview.earningsStats().beatRate()).isCloseTo(66.67, within(0.01));
        assertThat(overview.earningsStats().streak()).isEqualTo(new Dtos.Streak(EarningsResult.MISS, 1));
        assertThat(overview.stale()).isFalse();
        assertThat(f.store.peek("viewed", SAP)).isPresent();
    }

    @Test
    void servesStaleDataWhenProvidersFailAfterCaching() {
        f.stocks.overview(SAP);
        f.clock.advance(Duration.ofMinutes(2)); // quote expired, still retained
        f.provider.failing = true;

        Dtos.StockOverview overview = f.stocks.overview(SAP);

        assertThat(overview.stale()).isTrue();
        assertThat(overview.quote().price()).isEqualTo(185.92);
    }

    @Test
    void failsWhenNothingIsCachedAndProvidersAreDown() {
        f.provider.failing = true;

        assertThatThrownBy(() -> f.stocks.overview(SAP)).isInstanceOf(ProviderException.class);
    }

    @Test
    void pricesCutTheRangeAndMarkReactionDaysAndTheUpcomingReport() {
        Dtos.Prices month = f.stocks.prices(SAP, PriceRange.M1);
        assertThat(month.bars().getFirst().date()).isEqualTo(LocalDate.of(2026, 8, 26));
        assertThat(month.bars().getLast().date()).isEqualTo(LocalDate.of(2026, 9, 25));
        // The range's change is measured from the close before it, like the 1M performance chip.
        double aug25 = f.provider.bars.get(SAP).stream().filter(b -> b.date().equals(LocalDate.of(2026, 8, 25)))
                .findFirst().orElseThrow().close();
        assertThat(month.baseClose()).isEqualTo(aug25);
        assertThat(month.earningsMarkers()).extracting(Dtos.EarningsMarker::result).containsExactly("UPCOMING");

        Dtos.Prices year = f.stocks.prices(SAP, PriceRange.Y1);
        assertThat(year.currency()).isEqualTo("EUR");
        assertThat(year.earningsMarkers()).extracting(Dtos.EarningsMarker::date).containsExactly(
                LocalDate.of(2026, 1, 29), LocalDate.of(2026, 4, 24), LocalDate.of(2026, 7, 23),
                LocalDate.of(2026, 10, 21)); // AMC reacts next day; unknown time in Europe = before open
        assertThat(year.earningsMarkers()).extracting(Dtos.EarningsMarker::result)
                .containsExactly("BEAT", "BEAT", "MISS", "UPCOMING");
    }

    @Test
    void oneDayIsTheLatestSessionInFiveMinuteBarsMeasuredFromThePreviousClose() {
        f.intradayBars.put(SAP, List.of(
                new IntradayBar(Instant.parse("2026-09-28T07:00:00Z"), 200, 201, 199, 200.5, 1000),
                new IntradayBar(Instant.parse("2026-09-28T07:05:00Z"), 200.5, 202, 200, 201.5, 800)));

        Dtos.Prices day = f.stocks.prices(SAP, PriceRange.D1);

        assertThat(day.range()).isEqualTo("1D");
        assertThat(day.bars()).extracting(Dtos.PriceBar::time).containsExactly(
                Instant.parse("2026-09-28T07:00:00Z"), Instant.parse("2026-09-28T07:05:00Z"));
        assertThat(day.bars().getFirst().date()).isEqualTo(LocalDate.of(2026, 9, 28));
        double sep25 = f.provider.bars.get(SAP).getLast().close();
        assertThat(day.baseClose()).isEqualTo(sep25);
        assertThat(day.earningsMarkers()).isEmpty();
        assertThat(f.stocks.prices(SAP, PriceRange.M1).bars().getLast().time()).isNull();
    }

    @Test
    void aWeekInHourlyBarsKeepsTheRangesSessionsAndMeasuresFromTheCloseBefore() {
        f.intradayBars.put(SAP, List.of(
                new IntradayBar(Instant.parse("2026-09-17T07:00:00Z"), 190, 191, 189, 190.5, 500), // before 1W
                new IntradayBar(Instant.parse("2026-09-21T07:00:00Z"), 200, 201, 199, 200.5, 1000),
                new IntradayBar(Instant.parse("2026-09-25T15:00:00Z"), 200.5, 202, 200, 201.5, 800)));

        Dtos.Prices week = f.stocks.prices(SAP, PriceRange.W1, BarInterval.H1);

        assertThat(week.interval()).isEqualTo("1h");
        assertThat(week.bars()).extracting(Dtos.PriceBar::date)
                .containsExactly(LocalDate.of(2026, 9, 21), LocalDate.of(2026, 9, 25));
        double sep18 = f.provider.bars.get(SAP).stream().filter(b -> b.date().equals(LocalDate.of(2026, 9, 18)))
                .findFirst().orElseThrow().close();
        assertThat(week.baseClose()).isEqualTo(sep18);
        assertThat(week.earningsMarkers()).isEmpty();
    }

    @Test
    void weeklyBarsSpanEachCalendarWeekAndAreDatedByItsLastSession() {
        List<PriceBar> weeks = StockService.weekly(List.of(
                new PriceBar(LocalDate.of(2026, 9, 17), 10, 12, 9, 11, 100),
                new PriceBar(LocalDate.of(2026, 9, 18), 11, 13, 10, 12, 200),
                new PriceBar(LocalDate.of(2026, 9, 21), 12, 15, 8, 14, 300)));

        assertThat(weeks).containsExactly(
                new PriceBar(LocalDate.of(2026, 9, 18), 10, 13, 9, 12, 300),
                new PriceBar(LocalDate.of(2026, 9, 21), 12, 15, 8, 14, 300));
        Dtos.Prices year = f.stocks.prices(SAP, PriceRange.Y1, BarInterval.W1);
        assertThat(year.bars()).hasSizeBetween(52, 54);
        assertThat(year.bars().getLast().date()).isEqualTo(LocalDate.of(2026, 9, 25));
    }

    @Test
    void earningsListReportedQuartersWithResultsAndReactions() {
        Dtos.Earnings earnings = f.stocks.earnings(SAP);

        assertThat(earnings.upcoming().date()).isEqualTo(LocalDate.of(2026, 10, 21));
        assertThat(earnings.quarters()).extracting(Dtos.EarningsQuarter::date).containsExactly(
                LocalDate.of(2026, 7, 23), LocalDate.of(2026, 4, 23), LocalDate.of(2026, 1, 29));
        Dtos.EarningsQuarter july = earnings.quarters().getFirst();
        assertThat(july.timeAssumed()).isTrue();
        assertThat(july.result()).isEqualTo(EarningsResult.MISS);
        assertThat(july.eps().surprisePercent()).isCloseTo((1.59 - 1.75) / 1.75 * 100, within(1e-9));
        assertThat(july.reaction()).isNotNull();
        assertThat(july.reaction().reactionDayPercent()).isNotNull();
        assertThat(earnings.stats().quartersAnalyzed()).isEqualTo(3);
    }

    @Test
    void historyPagesAggregatedRows() {
        Dtos.History weekly = f.stocks.history(SAP, HistoryCalculator.Period.WEEKLY, null, 3);

        assertThat(weekly.period()).isEqualTo("WEEKLY");
        assertThat(weekly.rows()).extracting(Dtos.HistoryRow::periodStart).containsExactly(LocalDate.of(2026, 9, 21),
                LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 7));
        assertThat(weekly.rows().getFirst().partial()).isFalse(); // Sunday: the week is over
        assertThat(weekly.nextBefore()).isEqualTo(LocalDate.of(2026, 9, 7));

        Dtos.History july = f.stocks.history(SAP, HistoryCalculator.Period.DAILY, LocalDate.of(2026, 7, 24), 1);
        assertThat(july.rows().getFirst().periodStart()).isEqualTo(LocalDate.of(2026, 7, 23));
        assertThat(july.rows().getFirst().hasEarnings()).isTrue();
    }

    @Test
    void listsUseTheLogosOfStoredProfilesAfterARestart() {
        f.profiles.profile(SAP);
        ProfileService restarted = new ProfileService(new TieredCache(f.store, ProviderTestSupport.JSON, f.clock),
                f.router, f.fx, f.clock);

        assertThat(restarted.logos(List.of(SAP, "NOPE.DE")))
                .containsExactly(Map.entry(SAP, "https://logos.example/sap.png"));
        long reads = f.store.usage().reads();
        restarted.logos(List.of("NOPE.DE"));
        assertThat(f.store.usage().reads()).as("an unknown symbol is not read again").isEqualTo(reads);
    }

    @Test
    void peersComeWithListingData() {
        f.provider.peers.put(SAP, List.of("SIE.DE", "NOPE.DE"));
        f.provider.listings.put("SIE.DE", new SymbolMatch("SIE.DE", "Siemens AG", Exchange.XETRA, "EUR"));

        assertThat(f.stocks.peers(SAP)).containsExactly(
                new Dtos.SearchResult("SIE.DE", "Siemens AG", "XETRA", Region.EU, "EUR",
                        "https://assets.parqet.com/logos/symbol/SIE.DE?format=png&size=128"));
    }

    @Test
    void pricesTopUpIncrementallyAndRefetchAfterASplit() {
        f.prices.bars(SAP);
        assertThat(f.provider.barRequests).containsExactly(LocalDate.of(2021, 9, 20)); // 5 years + a week
        f.prices.bars(SAP);
        assertThat(f.provider.barRequests).hasSize(1); // fresh

        List<PriceBar> bars = new ArrayList<>(f.provider.bars.get(SAP));
        bars.add(new PriceBar(LocalDate.of(2026, 9, 28), 200, 201, 199, 200, 1));
        f.provider.bars.put(SAP, bars);
        f.clock.set(Instant.parse("2026-09-28T16:30:00Z")); // Monday 18:30 in Frankfurt: session settled
        assertThat(f.prices.bars(SAP).value().getLast().date()).isEqualTo(LocalDate.of(2026, 9, 28));
        assertThat(f.provider.barRequests).last().isEqualTo(LocalDate.of(2026, 9, 25)); // only new sessions

        List<PriceBar> split = new ArrayList<>(bars.stream()
                .map(b -> new PriceBar(b.date(), b.open() / 2, b.high() / 2, b.low() / 2, b.close() / 2, b.volume()))
                .toList());
        split.add(new PriceBar(LocalDate.of(2026, 9, 29), 101, 102, 100, 101, 1));
        f.provider.bars.put(SAP, split);
        f.clock.set(Instant.parse("2026-09-29T16:30:00Z"));
        List<PriceBar> after = f.prices.bars(SAP).value();

        assertThat(f.provider.barRequests).last().isEqualTo(LocalDate.of(2021, 9, 22)); // full refetch
        assertThat(after.getLast().close()).isEqualTo(101);
        assertThat(after.get(after.size() - 2).close()).isEqualTo(100); // history now split-adjusted
    }

    @Test
    void recordedCalendarDataDoesNotMakeAHistoryLookFresh() {
        f.earnings.record("AAPL", "finnhub", List.of(report("AAPL", "2026-10-29", ReportTime.AMC, 4, 1.98, null)));
        f.provider.earnings.put("AAPL", List.of(report("AAPL", "2026-07-30", ReportTime.AMC, 3, 1.89, 2.02)));
        int before = f.provider.calls.get();

        List<EarningsReport> reports = f.earnings.reports("AAPL").value();

        assertThat(f.provider.calls.get()).isGreaterThan(before); // still asked the providers
        assertThat(reports).extracting(EarningsReport::date)
                .containsExactly(LocalDate.of(2026, 10, 29), LocalDate.of(2026, 7, 30));
    }

    @Test
    void storageKeepsOneRowPerSourceAndQuarter() {
        List<com.earningstracker.domain.EarningsMerger.SourcedReport> stored = List.of(
                new com.earningstracker.domain.EarningsMerger.SourcedReport("finnhub", report("AAPL", "2026-10-28", ReportTime.UNKNOWN, 4, 1.95, null)),
                new com.earningstracker.domain.EarningsMerger.SourcedReport("fmp", report("AAPL", "2026-10-29", ReportTime.UNKNOWN, null, 1.99, null)),
                new com.earningstracker.domain.EarningsMerger.SourcedReport("finnhub", report("AAPL", "2026-07-30", ReportTime.AMC, 3, 1.90, 1.91)));
        List<com.earningstracker.domain.EarningsMerger.SourcedReport> fresh = List.of(
                new com.earningstracker.domain.EarningsMerger.SourcedReport("finnhub", report("AAPL", "2026-10-29", ReportTime.AMC, 4, 2.02, null)));

        List<com.earningstracker.domain.EarningsMerger.SourcedReport> rows = EarningsService.upsert(stored, fresh);

        assertThat(rows).hasSize(3); // the fresh Finnhub Q4 row replaced the stored one; the rest is kept
        assertThat(rows).filteredOn(r -> r.source().equals("finnhub")).extracting(r -> r.report().epsEstimate())
                .containsExactlyInAnyOrder(2.02, 1.90);
    }

    @Test
    void calendarFiltersAndSortsByMarketCap() {
        LocalDate day = LocalDate.of(2026, 10, 21);
        f.calendar.saveDay(day, List.of(event("AAPL", Region.US, null), event("SAP.DE", Region.EU, 244e9),
                event("XYZ", Region.US, 1e9)));
        f.store.set("users/u1/follows", "AAPL", Map.of("symbol", "AAPL", "name", "Apple"));

        Dtos.Calendar all = f.calendar.calendar(day.minusDays(1), day.plusDays(1), 0, CalendarService.RegionFilter.ALL,
                false, "u1");
        assertThat(all.days()).extracting(Dtos.CalendarDay::date).containsExactly(day.minusDays(1), day, day.plusDays(1));
        assertThat(all.days().get(1).events()).extracting(Dtos.EarningsEvent::symbol)
                .containsExactly("SAP.DE", "XYZ", "AAPL"); // unknown cap last
        assertThat(all.days().getFirst().events()).isEmpty();

        assertThat(symbols(f.calendar.calendar(day, day, 2e9, CalendarService.RegionFilter.ALL, false, "u1")))
                .containsExactly("SAP.DE");
        assertThat(symbols(f.calendar.calendar(day, day, 0, CalendarService.RegionFilter.US, false, "u1")))
                .containsExactly("XYZ", "AAPL");
        assertThat(symbols(f.calendar.calendar(day, day, 0, CalendarService.RegionFilter.ALL, true, "u1")))
                .containsExactly("AAPL");
    }

    @Test
    void followedEarningsUseStoredDataAndLoadMissingSymbolsInTheBackground() {
        f.stocks.earnings(SAP); // stored
        f.provider.earnings.put("AAPL", List.of(report("AAPL", "2026-10-29", ReportTime.AMC, 4, 1.98, null)));
        f.store.set("users/u1/follows", SAP, Map.of("symbol", SAP, "name", "SAP SE", "exchange", "XETRA"));
        f.store.set("users/u1/follows", "AAPL", Map.of("symbol", "AAPL", "name", "Apple Inc.", "exchange", "NASDAQ"));

        Dtos.FollowedEarnings first = f.followed.followed("u1");
        assertThat(first.upcoming()).extracting(Dtos.EarningsEvent::symbol).containsExactly(SAP);
        assertThat(first.noUpcomingDate()).extracting(Dtos.SearchResult::symbol).containsExactly("AAPL");

        f.clock.advance(Duration.ofMinutes(2)); // follows are cached for a minute
        Dtos.FollowedEarnings second = f.followed.followed("u1"); // AAPL was loaded in the background
        assertThat(second.upcoming()).extracting(Dtos.EarningsEvent::symbol).containsExactly(SAP, "AAPL");
    }

    @Test
    void searchPutsExactMatchesFirstAndInterleavesRegions() {
        SymbolMatch sapiens = new SymbolMatch("SPNS", "Sapiens", Exchange.NASDAQ, "USD");
        SymbolMatch sapAdr = new SymbolMatch("SAP", "SAP SE", Exchange.NYSE, "USD");
        SymbolMatch sapDe = new SymbolMatch("SAP.DE", "SAP SE", Exchange.XETRA, "EUR");

        assertThat(SearchService.rank("sap", List.of(sapiens, sapAdr), List.of(sapDe), 10))
                .containsExactly(sapDe, sapAdr, sapiens);
        f.provider.searchResults.put(Region.US, List.of(sapiens, sapAdr));
        f.provider.searchResults.put(Region.EU, List.of(sapDe));
        assertThat(f.search.results("sap", 2)).extracting(Dtos.SearchResult::symbol).containsExactly("SAP.DE", "SAP");
    }

    private static Dtos.EarningsEvent event(String symbol, Region region, Double marketCapUsd) {
        return new Dtos.EarningsEvent(symbol, symbol, "X", region, null, LocalDate.of(2026, 10, 21), ReportTime.BMO,
                null, null, "USD", null, null, null, null, marketCapUsd);
    }

    private static List<String> symbols(Dtos.Calendar calendar) {
        return calendar.days().getFirst().events().stream().map(Dtos.EarningsEvent::symbol).toList();
    }
}
