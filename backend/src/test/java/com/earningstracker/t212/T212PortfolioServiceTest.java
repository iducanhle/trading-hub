package com.earningstracker.t212;

import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.fixture;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static com.earningstracker.provider.t212.T212TestSupport.API_KEY;
import static com.earningstracker.provider.t212.T212TestSupport.API_SECRET;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
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
import com.earningstracker.service.ProfileService;
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
        T212Encryption encryption = new T212Encryption(properties);
        T212Client client = new T212Client(properties, JSON, clock, new RecordingSleeper(clock));
        T212StateStore states = new T212StateStore(store);
        T212DataStore data = new T212DataStore(store);
        T212SyncTracker tracker = new T212SyncTracker();
        connection = new T212ConnectionService(client, new T212CredentialStore(store, encryption, clock), states, data,
                tracker, encryption, properties, clock);
        sync = new T212SyncService(client, connection, states, data, tracker, executor, clock);
        ProfileService profiles = mock(ProfileService.class);
        given(profiles.logos(any())).willReturn(Map.of("AAPL", "https://logos.example/aapl.png"));
        FxService fx = mock(FxService.class);
        given(fx.toUsd(any(), any())).willAnswer(call -> switch ((String) call.getArgument(1)) {
            case "EUR" -> (Double) call.getArgument(0) * 1.10;
            case "USD" -> call.getArgument(0);
            default -> null;
        });
        portfolio = new T212PortfolioService(connection, data, new T212LiveService(client, connection, properties,
                clock), profiles, fx, clock);

        connection.connect(UID, new T212Dtos.CredentialsRequest(API_KEY, API_SECRET, T212Environment.DEMO));
        sync.runNow(UID).orElseThrow();
    }

    @AfterEach
    void stop() {
        executor.close();
        server.close();
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
        assertThat(azn.logoUrl()).isEqualTo("https://financialmodelingprep.com/image-stock/AZN.L.png");
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
        T212Dtos.TradePage first = portfolio.trades(UID, T212Period.ALL_TIME, null, null, null, 2);
        assertThat(first.items()).extracting(T212Dtos.Trade::id).containsExactly("1003-2003", "1001-2001");
        assertThat(first.nextCursor()).isNotNull();

        T212Dtos.TradePage second = portfolio.trades(UID, T212Period.ALL_TIME, null, null, first.nextCursor(), 2);
        assertThat(second.items()).extracting(T212Dtos.Trade::id).containsExactly("900-901", "1000-2000");
        assertThat(second.nextCursor()).isNull();

        assertThat(portfolio.trades(UID, T212Period.ALL_TIME, T212PortfolioService.SideFilter.SELL, null, null, 50)
                .items()).extracting(T212Dtos.Trade::id).containsExactly("1003-2003");
        assertThat(portfolio.trades(UID, T212Period.ALL_TIME, null, "AZNl_EQ", null, 50).items())
                .singleElement().satisfies(t -> {
                    assertThat(t.price()).isEqualTo(120.0);
                    assertThat(t.priceCurrency()).isEqualTo("GBP");
                    assertThat(t.realizedPnl()).isNull();
                });
        assertThatThrownBy(() -> portfolio.trades(UID, T212Period.ALL_TIME, null, null, "%%%", 2))
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
