package com.earningstracker.t212;

import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.fixture;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static com.earningstracker.provider.t212.T212TestSupport.API_KEY;
import static com.earningstracker.provider.t212.T212TestSupport.API_SECRET;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.earningstracker.cache.InMemoryDocumentStore;
import com.earningstracker.fx.FxService;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import com.earningstracker.provider.t212.T212Client;
import com.earningstracker.provider.t212.T212Environment;
import com.earningstracker.provider.t212.T212TestSupport;
import com.earningstracker.provider.t212.T212TestSupport.MutableClock;
import com.earningstracker.provider.t212.T212TestSupport.RecordingSleeper;
import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.market.Quote;
import com.earningstracker.service.ProfileService;
import com.earningstracker.service.QuoteService;
import com.earningstracker.web.dto.T212Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import mockwebserver3.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Over the synced fixtures: AAPL bought 10 for 1,656 and sold 5 for 900 (Trading 212 realized 90.50, FX fee 1.35),
 * AZN.L bought for 1,400 (stamp duty ≈ 7.00), an NVDA split, an AAPL dividend of 2.10, a deposit of 5,000, a
 * withdrawal of 200 and 1.20 interest. Live: AAPL open (unrealized −92), account unrealized 400.
 */
class T212PortfolioServiceTest {

    private static final String UID = "uid-1";

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes();
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-02T10:00:00Z"));
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private T212ConnectionService connection;
    private T212PortfolioService portfolio;
    private T212SyncService sync;
    private T212SnapshotStore snapshots;
    private T212LiveService live;
    private T212StateStore states;
    private T212Encryption encryption;
    private final QuoteService quotes = mock(QuoteService.class);

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        T212Properties properties = T212TestSupport.properties(server.url("/").toString().replaceAll("/$", ""));
        routes.on("/api/v0/equity/account/summary", json("t212/account-summary.json"))
                .on("/api/v0/equity/positions", json("t212/positions.json"))
                .on("/api/v0/equity/history/orders", request -> json(request.getUrl().queryParameter("cursor") == null
                        ? "t212/orders-page1.json" : "t212/orders-page2.json"))
                .on("/api/v0/equity/history/dividends", json("t212/dividends.json"))
                .on("/api/v0/equity/history/transactions", json("t212/transactions.json"));
        InMemoryDocumentStore store = new InMemoryDocumentStore();
        encryption = new T212Encryption(properties);
        T212Client client = new T212Client(properties, JSON, clock, new RecordingSleeper(clock));
        states = new T212StateStore(store);
        snapshots = new T212SnapshotStore(store);
        T212DataStore data = new T212DataStore(store);
        T212SyncTracker tracker = new T212SyncTracker();
        connection = new T212ConnectionService(client, new T212CredentialStore(store, encryption, clock), states, data,
                tracker, encryption, properties, clock);
        sync = new T212SyncService(client, connection, states, data, tracker, executor, clock);
        ProfileService profiles = mock(ProfileService.class);
        given(profiles.logos(any())).willReturn(Map.of("AAPL", "https://logos.example/aapl.png"));
        given(quotes.quote("AAPL")).willReturn(new Cached<>(
                Quote.of("AAPL", 170.0, 172.0, "USD", clock.instant()), clock.instant(), false));
        FxService fx = mock(FxService.class);
        given(fx.toUsd(any(), any())).willAnswer(call -> switch ((String) call.getArgument(1)) {
            case "EUR" -> (Double) call.getArgument(0) * 1.10;
            case "USD" -> call.getArgument(0);
            default -> null;
        });
        live = new T212LiveService(client, connection, properties, clock);
        portfolio = new T212PortfolioService(connection, data, live,
                new T212PieService(client, connection, clock), profiles, quotes, fx, snapshots, clock);

        connection.connect(UID, new T212Dtos.CredentialsRequest(API_KEY, API_SECRET, T212Environment.DEMO));
        sync.runNow(UID).orElseThrow();
    }

    @AfterEach
    void stop() {
        executor.close();
        server.close();
    }

    private static final String PIE_POSITION = """
            [{ "instrument": { "ticker": "AAPL_US_EQ", "name": "Apple", "currency": "USD" }, "quantity": 10,
               "quantityInPies": 4, "averagePricePaid": 180.0, "currentPrice": 170.0,
               "walletImpact": { "currentValue": 1564.0, "totalCost": 1656.0, "unrealizedProfitLoss": -92.0 } }]
            """;

    @Test
    void holdingsListOpenPositionsWithTheirUnrealizedResult() {
        T212Dtos.HoldingList h = portfolio.holdings(UID);

        assertThat(h.accountCurrency()).isEqualTo("EUR");
        assertThat(h.piesAvailable()).isTrue();
        assertThat(h.items()).singleElement().satisfies(item -> {
            assertThat(item.kind()).isEqualTo("POSITION");
            assertThat(item.position().t212Ticker()).isEqualTo("AAPL_US_EQ");
            assertThat(item.position().symbol()).isEqualTo("AAPL");
            assertThat(item.position().logoUrl()).isEqualTo("https://logos.example/aapl.png");
            assertThat(item.position().quantity()).isEqualTo(10);
            assertThat(item.position().value()).isEqualTo(1564.0);
            assertThat(item.position().pnl()).isEqualTo(-92.0);
            assertThat(item.position().pnlPct()).isEqualTo(-5.56); // −92 ÷ 1,656
        });
        assertThat(routes.requests("/api/v0/equity/pies")).isEmpty();
    }

    @Test
    void allocationGivesSharesWithoutQuoting() {
        T212Dtos.Allocation a = portfolio.allocation(UID);

        assertThat(a.total()).isEqualTo(1564.0);
        assertThat(a.items()).singleElement().satisfies(item -> {
            assertThat(item.t212Ticker()).isEqualTo("AAPL_US_EQ");
            assertThat(item.value()).isEqualTo(1564.0);
            assertThat(item.weightPct()).isEqualTo(100.0);
        });
        verifyNoInteractions(quotes);
    }

    @Test
    void historyKeepsTheLastPointOfEachDayWithNetDepositsUpToThen() {
        snapshots.add(UID, new T212SnapshotStore.Point(Instant.parse("2026-07-31T10:00:00Z"), 5100));
        snapshots.add(UID, new T212SnapshotStore.Point(Instant.parse("2026-08-02T10:00:00Z"), 4900));
        snapshots.add(UID, new T212SnapshotStore.Point(Instant.parse("2026-08-02T15:00:00Z"), 4950));

        T212Dtos.History all = portfolio.history(UID, T212PortfolioService.HistoryRange.ALL,
                T212PortfolioService.HistoryInterval.D1);

        assertThat(all.range()).isEqualTo("ALL");
        assertThat(all.points()).containsExactly(
                new T212Dtos.HistoryPoint(Instant.parse("2026-07-31T10:00:00Z"), 5100.0, 5000.0, 100.0),
                new T212Dtos.HistoryPoint(Instant.parse("2026-08-02T15:00:00Z"), 4950.0, 4800.0, 150.0));
        assertThat(portfolio.history(UID, T212PortfolioService.HistoryRange.M1,
                T212PortfolioService.HistoryInterval.H1).points()).isEmpty();
    }

    @Test
    void historyIntervalsBucketInPragueTime() {
        // 2026-10-02 in Prague is UTC+2: 06:00Z = 08:00, 07:45Z = 09:45, 08:15Z = 10:15.
        snapshots.add(UID, new T212SnapshotStore.Point(Instant.parse("2026-10-02T06:00:00Z"), 1));
        snapshots.add(UID, new T212SnapshotStore.Point(Instant.parse("2026-10-02T07:45:00Z"), 2));
        snapshots.add(UID, new T212SnapshotStore.Point(Instant.parse("2026-10-02T08:15:00Z"), 3));

        assertThat(portfolio.history(UID, T212PortfolioService.HistoryRange.D1,
                T212PortfolioService.HistoryInterval.H1).points()).extracting(T212Dtos.HistoryPoint::value)
                .containsExactly(1.0, 2.0, 3.0);
        assertThat(portfolio.history(UID, T212PortfolioService.HistoryRange.W1,
                T212PortfolioService.HistoryInterval.H4).points()).extracting(T212Dtos.HistoryPoint::value)
                .containsExactly(3.0); // 08:00–12:00
        assertThat(T212PortfolioService.HistoryRange.D1.offers(T212PortfolioService.HistoryInterval.D1)).isFalse();
    }

    @Test
    void snapshotJobStoresTheAccountValueAtTheJobTime() {
        Map<String, Object> stats = new com.earningstracker.jobs.T212SnapshotJob(live, snapshots, states, encryption,
                clock).run();

        assertThat(stats).containsEntry("stored", 1).containsEntry("skipped", 0);
        assertThat(portfolio.history(UID, T212PortfolioService.HistoryRange.D1,
                T212PortfolioService.HistoryInterval.M15).points()).singleElement()
                .satisfies(p -> {
                    assertThat(p.at()).isEqualTo(clock.instant());
                    assertThat(p.value()).isEqualTo(10450.25);
                    assertThat(p.profit()).isEqualTo(10450.25 - 4800);
                });
    }

    @Test
    void dayChangesGiveTodaysChangeByTicker() {
        assertThat(portfolio.dayChanges(UID).changes()).containsExactly(entry("AAPL_US_EQ", -1.16)); // 170 after 172
    }

    @Test
    void dayChangesLeaveOutAFailedQuote() {
        given(quotes.quote("AAPL")).willThrow(new IllegalStateException("down"));

        assertThat(portfolio.dayChanges(UID).changes()).isEmpty();
    }

    @Test
    void holdingsSplitAPositionBetweenAPieAndTheRest() {
        routes.on("/api/v0/equity/positions", body(200, PIE_POSITION))
                .on("/api/v0/equity/pies", body(200, """
                        [{ "id": 7, "cash": 3.5, "result": { "priceAvgValue": 650.0, "priceAvgInvestedValue": 600.0,
                           "priceAvgResult": 50.0, "priceAvgResultCoef": 0.08333 } }]
                        """))
                .on("/api/v0/equity/pies/7", body(200, """
                        { "settings": { "id": 7, "name": "Tech" },
                          "instruments": [{ "ticker": "AAPL_US_EQ", "ownedQuantity": 4,
                            "result": { "priceAvgValue": 650.0, "priceAvgResult": 50.0,
                                        "priceAvgResultCoef": 0.08333 } }] }
                        """));

        T212Dtos.HoldingList h = portfolio.holdings(UID);

        assertThat(h.piesAvailable()).isTrue();
        assertThat(h.items()).extracting(T212Dtos.Holding::kind).containsExactly("POSITION", "PIE");
        T212Dtos.HoldingPosition outside = h.items().getFirst().position();
        assertThat(outside.quantity()).isEqualTo(6);
        assertThat(outside.value()).isEqualTo(938.4); // 6 of 10 shares
        assertThat(outside.pnl()).isEqualTo(-55.2);
        T212Dtos.Pie pie = h.items().get(1).pie();
        assertThat(pie.id()).isEqualTo(7L);
        assertThat(pie.name()).isEqualTo("Tech");
        assertThat(pie.value()).isEqualTo(650.0);
        assertThat(pie.pnl()).isEqualTo(50.0);
        assertThat(pie.pnlPct()).isEqualTo(8.33);
        assertThat(pie.positions()).singleElement().satisfies(p -> {
            assertThat(p.name()).isEqualTo("Apple");
            assertThat(p.quantity()).isEqualTo(4);
            assertThat(p.value()).isEqualTo(650.0);
        });

        portfolio.holdings(UID);
        assertThat(routes.requests("/api/v0/equity/pies/7")).hasSize(1); // reused, not fetched again
    }

    @Test
    void holdingsGroupThePiePartWhenPiesCannotBeRead() {
        routes.on("/api/v0/equity/positions", body(200, PIE_POSITION))
                .on("/api/v0/equity/pies", body(403, "{}"));

        T212Dtos.HoldingList h = portfolio.holdings(UID);

        assertThat(h.piesAvailable()).isFalse();
        T212Dtos.Pie pie = h.items().get(1).pie();
        assertThat(pie.id()).isNull();
        assertThat(pie.name()).isNull();
        assertThat(pie.value()).isEqualTo(625.6); // 4 of 10 shares
        assertThat(pie.pnl()).isEqualTo(-36.8);
        assertThat(pie.positions()).singleElement().extracting(T212Dtos.HoldingPosition::quantity).isEqualTo(4.0);
        assertThat(connection.status(UID).credentialsValid()).isTrue(); // a pie failure is not a bad key
    }

    @Test
    void allTimeSummaryAddsUnrealizedAndAPercentage() {
        T212Dtos.Summary s = portfolio.summary(UID, T212Period.ALL_TIME);

        assertThat(s.accountCurrency()).isEqualTo("EUR");
        assertThat(s.totalValue()).isEqualTo(10450.25);
        assertThat(s.cash()).isEqualTo(950.25);
        assertThat(s.invested()).isEqualTo(9100.0);
        assertThat(s.realizedPnl()).isEqualTo(90.5);
        assertThat(s.dividends()).isEqualTo(2.1);
        assertThat(s.fees()).isEqualTo(8.35);
        assertThat(s.unrealizedPnl()).isEqualTo(400.0);
        assertThat(s.includesUnrealized()).isTrue();
        assertThat(s.totalPnl()).isEqualTo(484.25); // 90.50 + 2.10 − 8.35 + 400
        assertThat(s.totalPnlPct()).isEqualTo(15.85); // ÷ 3,056 bought
        assertThat(s.rateOfReturnPct()).isEqualTo(113.99); // 5,000 in March, 200 out in August, 10,450.25 now
        assertThat(s.deposits()).isEqualTo(5000);
        assertThat(s.withdrawals()).isEqualTo(200);
        assertThat(s.netDeposits()).isEqualTo(4800);
        assertThat(s.interest()).isEqualTo(1.2);
        assertThat(s.tradeCount()).isEqualTo(3);
        assertThat(s.best().t212Ticker()).isEqualTo("NVDA_US_EQ"); // 0
        assertThat(s.worst().t212Ticker()).isEqualTo("AZNl_EQ"); // −7
        assertThat(s.stale()).isFalse();
        assertThat(s.syncState()).isEqualTo("IDLE");
        assertThat(s.asOf()).isEqualTo(clock.instant());
    }

    @Test
    void aPeriodSummaryLeavesUnrealizedOutAndHasNoPercentage() {
        T212Dtos.Summary s = portfolio.summary(UID, T212Period.of(LocalDate.of(2026, 9, 1),
                LocalDate.of(2026, 9, 30), "Europe/Prague"));

        assertThat(s.from()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(s.tz()).isEqualTo("Europe/Prague");
        assertThat(s.realizedPnl()).isEqualTo(90.5);
        assertThat(s.fees()).isEqualTo(1.35);
        assertThat(s.dividends()).isZero();
        assertThat(s.interest()).isEqualTo(1.2);
        assertThat(s.unrealizedPnl()).isEqualTo(400.0); // shown, as of now
        assertThat(s.includesUnrealized()).isFalse();
        assertThat(s.totalPnl()).isEqualTo(89.15);
        assertThat(s.totalPnlPct()).isNull();
        assertThat(s.rateOfReturnPct()).isNull();
        assertThat(s.best().t212Ticker()).isEqualTo("AAPL_US_EQ");
        assertThat(s.worst()).isNull(); // only one instrument in the period
    }

    @Test
    void instrumentsCarryLiveValuesSymbolsAndLogos() {
        T212Dtos.InstrumentList list = portfolio.instruments(UID, T212Period.ALL_TIME,
                T212PortfolioService.StatusFilter.ALL);

        assertThat(list.items()).extracting(T212Dtos.Instrument::t212Ticker)
                .containsExactly("NVDA_US_EQ", "AAPL_US_EQ", "AZNl_EQ"); // by total P/L, highest first
        T212Dtos.Instrument aapl = list.items().get(1);
        assertThat(aapl.symbol()).isEqualTo("AAPL");
        assertThat(aapl.name()).isEqualTo("Apple");
        assertThat(aapl.logoUrl()).isEqualTo("https://logos.example/aapl.png");
        assertThat(aapl.status()).isEqualTo("OPEN");
        assertThat(aapl.quantity()).isEqualTo(10);
        assertThat(aapl.averageCost()).isEqualTo(180.0);
        assertThat(aapl.currentPrice()).isEqualTo(170.0);
        assertThat(aapl.unrealizedPnl()).isEqualTo(-92.0);
        assertThat(aapl.totalPnl()).isEqualTo(-0.75); // 90.50 + 2.10 − 1.35 − 92
        assertThat(aapl.totalPnlPct()).isEqualTo(-0.05);
        assertThat(aapl.instrumentCurrency()).isEqualTo("USD");

        T212Dtos.Instrument azn = list.items().get(2);
        assertThat(azn.symbol()).isEqualTo("AZN.L");
        assertThat(azn.instrumentCurrency()).isEqualTo("GBP");
        assertThat(azn.logoUrl()).isEqualTo("https://assets.parqet.com/logos/symbol/AZN.L?format=png&size=128");
        assertThat(azn.status()).isEqualTo("CLOSED"); // not among the live positions
        assertThat(azn.averageCost()).isNull();

        assertThat(portfolio.instruments(UID, T212Period.ALL_TIME, T212PortfolioService.StatusFilter.OPEN).items())
                .extracting(T212Dtos.Instrument::t212Ticker).containsExactly("AAPL_US_EQ");
        assertThat(portfolio.instruments(UID, T212Period.of(LocalDate.of(2026, 9, 1), null, "UTC"),
                T212PortfolioService.StatusFilter.ALL).items()).extracting(T212Dtos.Instrument::t212Ticker)
                .containsExactly("AAPL_US_EQ");
    }

    @Test
    void instrumentDetailHasTheTimelineWithPositions() {
        T212Dtos.InstrumentDetail detail = portfolio.instrument(UID, "AAPL_US_EQ");

        assertThat(detail.trades()).extracting(T212Dtos.DetailTrade::side, T212Dtos.DetailTrade::positionAfter)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("SELL", 5.0),
                        org.assertj.core.groups.Tuple.tuple("BUY", 10.0));
        assertThat(detail.trades().getFirst().realizedPnl()).isEqualTo(90.5);
        assertThat(detail.dividends()).extracting(T212Dtos.Dividend::id).containsExactly("div-1");
        assertThat(detail.instrument().firstTradeAt()).isEqualTo(Instant.parse("2026-03-02T15:31:00Z"));

        assertThatThrownBy(() -> portfolio.instrument(UID, "TSLA_US_EQ")).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.code()).isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void tradesPageNewestFirstWithACursor() {
        T212Dtos.TradePage first = portfolio.trades(UID, T212Period.ALL_TIME, null, Set.of(), null, 2);
        assertThat(first.items()).extracting(T212Dtos.Trade::id).containsExactly("1003-2003", "1001-2001");
        assertThat(first.nextCursor()).isNotNull();

        T212Dtos.TradePage second = portfolio.trades(UID, T212Period.ALL_TIME, null, Set.of(), first.nextCursor(), 2);
        assertThat(second.items()).extracting(T212Dtos.Trade::id).containsExactly("900-901", "1000-2000");
        assertThat(second.nextCursor()).isNull();

        assertThat(portfolio.trades(UID, T212Period.ALL_TIME, T212PortfolioService.SideFilter.SELL, Set.of(), null, 50)
                .items()).extracting(T212Dtos.Trade::id).containsExactly("1003-2003");
        assertThat(portfolio.trades(UID, T212Period.ALL_TIME, null, Set.of("AZNl_EQ"), null, 50).items())
                .singleElement().satisfies(t -> {
                    assertThat(t.price()).isEqualTo(120.0);
                    assertThat(t.priceCurrency()).isEqualTo("GBP");
                    assertThat(t.realizedPnl()).isNull();
                });
        assertThatThrownBy(() -> portfolio.trades(UID, T212Period.ALL_TIME, null, Set.of(), "%%%", 2))
                .isInstanceOf(ApiException.class);
    }

    @Test
    void dividendsAndTransactionsWithTotals() {
        T212Dtos.DividendList dividends = portfolio.dividends(UID, T212Period.ALL_TIME, null);
        assertThat(dividends.total()).isEqualTo(2.1);
        assertThat(dividends.items().getFirst().symbol()).isEqualTo("AAPL");

        T212Dtos.TransactionList transactions = portfolio.transactions(UID, T212Period.ALL_TIME, "DEPOSIT");
        assertThat(transactions.items()).extracting(T212Dtos.Transaction::id).containsExactly("tx-1");
        assertThat(transactions.totals()).isEqualTo(new T212Dtos.TransactionTotals(5000, 200, 0, 1.2));
    }

    @Test
    void whenTrading212IsDownStoredDataIsServedWithoutLiveValues() {
        routes.on("/api/v0/equity/account/summary", body(503, "{}"));

        T212Dtos.Summary none = portfolio.summary(UID, T212Period.ALL_TIME);
        assertThat(none.stale()).isTrue();
        assertThat(none.totalValue()).isNull();
        assertThat(none.unrealizedPnl()).isNull();
        assertThat(none.includesUnrealized()).isFalse();
        assertThat(none.realizedPnl()).isEqualTo(90.5);
        assertThat(none.totalPnl()).isEqualTo(84.25); // without unrealized
        // Without positions, "open" follows the history: AAPL and AZN still held, NVDA from the split
        assertThat(portfolio.instruments(UID, T212Period.ALL_TIME, T212PortfolioService.StatusFilter.OPEN).items())
                .hasSize(3);

        routes.on("/api/v0/equity/account/summary", json("t212/account-summary.json"));
        clock.advance(Duration.ofMinutes(5));
        assertThat(portfolio.summary(UID, T212Period.ALL_TIME).stale()).isFalse();

        routes.on("/api/v0/equity/account/summary", body(503, "{}"));
        clock.advance(Duration.ofMinutes(5)); // past the live cache
        T212Dtos.Summary stale = portfolio.summary(UID, T212Period.ALL_TIME);
        assertThat(stale.stale()).isTrue();
        assertThat(stale.unrealizedPnl()).isEqualTo(400.0); // the last good copy
    }

    @Test
    void foreignCurrencyTransactionsAreConvertedForTheTotals() {
        routes.on("/api/v0/equity/history/transactions", body(200, fixture("t212/transactions.json").replace(
                "\"items\": [", "\"items\": [ { \"reference\": \"tx-usd\", \"type\": \"DEPOSIT\", \"amount\": 110, "
                        + "\"currency\": \"USD\", \"dateTime\": \"2026-09-30T12:00:00Z\" },")));
        sync.runNow(UID).orElseThrow();

        T212Dtos.TransactionList list = portfolio.transactions(UID, T212Period.ALL_TIME, null);
        assertThat(list.totals().deposits()).isEqualTo(5100); // 110 USD = 100 EUR at 1.10
        assertThat(list.items().getFirst().currency()).isEqualTo("USD"); // the item keeps its own currency
        assertThat(portfolio.summary(UID, T212Period.ALL_TIME).netDeposits()).isEqualTo(4900);
    }

    @Test
    void notConnectedIs409() {
        assertThatThrownBy(() -> portfolio.summary("someone-else", T212Period.ALL_TIME))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.code()).isEqualTo(ErrorCode.T212_NOT_CONNECTED));
    }
}
