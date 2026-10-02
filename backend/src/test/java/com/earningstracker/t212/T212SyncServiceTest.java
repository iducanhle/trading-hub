package com.earningstracker.t212;

import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.fixture;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static com.earningstracker.provider.t212.T212TestSupport.API_KEY;
import static com.earningstracker.provider.t212.T212TestSupport.API_SECRET;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import com.earningstracker.cache.InMemoryDocumentStore;
import com.earningstracker.jobs.T212SyncJob;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import com.earningstracker.provider.t212.T212Client;
import com.earningstracker.provider.t212.T212Environment;
import com.earningstracker.provider.t212.T212TestSupport;
import com.earningstracker.provider.t212.T212TestSupport.MutableClock;
import com.earningstracker.provider.t212.T212TestSupport.RecordingSleeper;
import com.earningstracker.web.dto.T212Dtos;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class T212SyncServiceTest {

    private static final String UID = "uid-1";
    private static final String ORDERS = "/api/v0/equity/history/orders";

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes();
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-02T10:00:00Z"));
    private final InMemoryDocumentStore store = new InMemoryDocumentStore();
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private T212Properties properties;
    private T212Encryption encryption;
    private T212Client client;
    private T212StateStore states;
    private T212DataStore data;
    private T212SyncTracker tracker;
    private T212ConnectionService connection;
    private T212SyncService sync;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        properties = T212TestSupport.properties(server.url("/").toString().replaceAll("/$", ""));
        encryption = new T212Encryption(properties);
        client = new T212Client(properties, JSON, clock, new RecordingSleeper(clock));
        routes.on("/api/v0/equity/account/summary", json("t212/account-summary.json"))
                .on("/api/v0/equity/positions", json("t212/positions.json"))
                .on(ORDERS, T212SyncServiceTest::ordersPage)
                .on("/api/v0/equity/history/dividends", json("t212/dividends.json"))
                .on("/api/v0/equity/history/transactions", json("t212/transactions.json"));
        restart();
        connection.connect(UID, new T212Dtos.CredentialsRequest(API_KEY, API_SECRET, T212Environment.DEMO));
        routes.requests().clear();
    }

    /** New service instances over the same Firestore, as after a server restart. */
    private void restart() {
        states = new T212StateStore(store);
        data = new T212DataStore(store);
        tracker = new T212SyncTracker();
        connection = new T212ConnectionService(client, new T212CredentialStore(store, encryption, clock), states,
                data, tracker, encryption, properties, clock);
        sync = new T212SyncService(client, connection, states, data, tracker, executor, clock);
    }

    @AfterEach
    void stop() {
        executor.close();
        server.close();
    }

    private static MockResponse ordersPage(RecordedRequest request) {
        String cursor = request.getUrl().queryParameter("cursor");
        return json(cursor == null ? "t212/orders-page1.json" : "t212/orders-page2.json");
    }

    private List<String> orderRequests() {
        return routes.requests(ORDERS).stream().map(r -> String.valueOf(r.getUrl().queryParameter("cursor"))).toList();
    }

    @Test
    void theFirstSyncReadsEveryPageAndStoresBuckets() {
        T212SyncService.Result result = sync.runNow(UID).orElseThrow();

        assertThat(result.newFills()).isEqualTo(4); // the cancelled order is not stored
        assertThat(result.newDividends()).isEqualTo(1);
        assertThat(result.newTransactions()).isEqualTo(3);
        assertThat(orderRequests()).containsExactly("null", "1751360400000");
        assertThat(routes.requests(ORDERS).getFirst().getUrl().queryParameter("limit")).isEqualTo("50");

        assertThat(store.peek("t212/" + UID + "/orders", "2026-09")).isPresent();
        assertThat(store.peek("t212/" + UID + "/orders", "2026-07")).isPresent();
        assertThat(store.peek("t212/" + UID + "/orders", "2026-06")).isPresent();
        assertThat(store.peek("t212/" + UID + "/orders", "2026-03")).isPresent();
        assertThat(store.peek("t212/" + UID + "/dividends", "2026")).isPresent();
        assertThat(store.peek("t212/" + UID + "/transactions", "2026")).isPresent();

        T212State state = states.find(UID).orElseThrow();
        assertThat(state.syncState()).isEqualTo(T212State.SyncState.IDLE);
        assertThat(state.lastSyncAt()).isEqualTo(clock.instant());
        assertThat(state.completeHistories()).containsExactlyInAnyOrder("ORDERS", "DIVIDENDS", "TRANSACTIONS");
        assertThat(routes.requests("/api/v0/equity/metadata")).isEmpty(); // every instrument had a currency
    }

    @Test
    void storedDataSurvivesARestartWithSymbolsMapped() {
        sync.runNow(UID);
        restart();

        T212UserData loaded = data.load(UID);
        assertThat(loaded.fills()).hasSize(4);
        assertThat(loaded.fills().get("1003-2003").realizedPnl()).isEqualTo(90.5);
        assertThat(loaded.fills().get("1001-2001").priceCurrency()).isEqualTo("GBP");
        assertThat(loaded.dividends()).containsKey("div-1");
        assertThat(loaded.transactions().get("tx-2").amount()).isEqualTo(-200.0);
        assertThat(loaded.instruments().get("AAPL_US_EQ").symbol()).isEqualTo("AAPL");
        assertThat(loaded.instruments().get("AZNl_EQ").symbol()).isEqualTo("AZN.L");
        assertThat(loaded.instruments().get("NVDA_US_EQ").name()).isEqualTo("NVIDIA");
        assertThat(loaded.instruments()).doesNotContainKey("MSFT_US_EQ"); // only the cancelled order named it
    }

    @Test
    void laterSyncsStopAtTheFirstPageWithNothingNew() {
        sync.runNow(UID);
        routes.requests().clear();

        T212SyncService.Result result = sync.runNow(UID).orElseThrow();

        assertThat(result.newFills()).isZero();
        assertThat(orderRequests()).containsExactly("null"); // page 1 was all known: page 2 not read
        assertThat(result.pages()).isEqualTo(3);
    }

    @Test
    void anIncrementalSyncAddsNewItemsAndReadsOnUntilAKnownPage() {
        sync.runNow(UID);
        routes.requests().clear();
        String newSell = fixture("t212/orders-page1.json").replace("\"id\": 1003", "\"id\": 1004")
                .replace("\"id\": 2003", "\"id\": 2004").replace("2026-09-20T15:00:00Z", "2026-10-01T15:00:00Z");
        routes.on(ORDERS, request -> request.getUrl().queryParameter("cursor") == null
                ? body(200, newSell) : json("t212/orders-page2.json"));

        T212SyncService.Result result = sync.runNow(UID).orElseThrow();

        assertThat(result.newFills()).isEqualTo(1);
        assertThat(orderRequests()).containsExactly("null", "1751360400000");
        assertThat(store.peek("t212/" + UID + "/orders", "2026-10")).isPresent();
        assertThat(data.load(UID).fills()).hasSize(5);
    }

    @Test
    void anInterruptedFirstSyncReadsEverythingAgain() {
        routes.on(ORDERS, request -> request.getUrl().queryParameter("cursor") == null
                ? json("t212/orders-page1.json") : body(500, "{}"));
        assertThat(sync.runNow(UID)).isEmpty();
        assertThat(states.find(UID).orElseThrow().syncState()).isEqualTo(T212State.SyncState.FAILED);
        assertThat(states.find(UID).orElseThrow().lastError().code()).isEqualTo("T212_UNAVAILABLE");

        routes.on(ORDERS, T212SyncServiceTest::ordersPage);
        routes.requests().clear();
        T212SyncService.Result result = sync.runNow(UID).orElseThrow();

        assertThat(orderRequests()).containsExactly("null", "1751360400000"); // not stopped at the known page 1
        assertThat(result.newFills()).isEqualTo(4);
    }

    @Test
    void aRejectedKeyMarksTheCredentialsInvalid() {
        routes.on(ORDERS, body(401, "{}"));

        assertThat(sync.runNow(UID)).isEmpty();

        T212Dtos.Status status = connection.status(UID);
        assertThat(status.credentialsValid()).isFalse();
        assertThat(status.syncState()).isEqualTo("FAILED");
        assertThat(status.lastError().code()).isEqualTo("T212_INVALID_CREDENTIALS");
    }

    @Test
    void oneSyncPerUserAndDisconnectCancelsIt() throws Exception {
        CountDownLatch inPage = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        routes.on(ORDERS, request -> {
            inPage.countDown();
            try {
                release.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return json("t212/orders-page2.json");
        });

        T212Dtos.Status started = sync.start(UID);
        assertThat(started.syncState()).isEqualTo("RUNNING");
        assertThat(inPage.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(sync.runNow(UID)).isEmpty(); // already running
        assertThat(sync.start(UID).syncStartedAt()).isEqualTo(started.syncStartedAt());

        connection.disconnect(UID);
        release.countDown();
        AtomicReference<Boolean> done = new AtomicReference<>(false);
        for (int i = 0; i < 100 && !done.get(); i++) {
            done.set(tracker.current(UID).isEmpty());
            Thread.sleep(20);
        }
        assertThat(done.get()).isTrue();
        assertThat(store.peek("t212", UID)).isEmpty();
        assertThat(store.list("t212/" + UID + "/orders")).isEmpty();
        assertThat(data.load(UID).isEmpty()).isTrue();
    }

    @Test
    void theJobSyncsConnectedUsersAndSkipsRejectedKeys() {
        connection.connect("uid-2", new T212Dtos.CredentialsRequest(API_KEY, API_SECRET, T212Environment.DEMO));
        connection.markInvalid("uid-2", "rejected");

        Map<String, Object> stats = new T212SyncJob(sync, states, encryption).run();

        assertThat(stats).containsEntry("users", 2).containsEntry("synced", 1).containsEntry("skipped", 1)
                .containsEntry("newItems", 8);
    }
}
