package com.earningstracker.provider.t212;

import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static com.earningstracker.provider.t212.T212TestSupport.API_KEY;
import static com.earningstracker.provider.t212.T212TestSupport.API_SECRET;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import com.earningstracker.provider.t212.T212Exception.Kind;
import com.earningstracker.provider.t212.T212TestSupport.MutableClock;
import com.earningstracker.provider.t212.T212TestSupport.RecordingSleeper;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class T212ClientTest {

    private static final Instant NOW = Instant.parse("2026-10-02T10:00:00Z");

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes();
    private final MutableClock clock = new MutableClock(NOW);
    private final RecordingSleeper sleeper = new RecordingSleeper(clock);
    private T212Client client;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        client = new T212Client(T212TestSupport.properties(server.url("/").toString().replaceAll("/$", "")), JSON,
                clock, sleeper);
    }

    @AfterEach
    void stop() {
        server.close();
    }

    @Test
    void sendsBasicAuthAndOnlyEverGets() {
        routes.on("/api/v0/equity/account/summary", json("t212/account-summary.json"))
                .on("/api/v0/equity/positions", json("t212/positions.json"));

        assertThat(client.accountSummary(T212TestSupport.credentials()).path("currency").stringValue())
                .isEqualTo("EUR");
        assertThat(client.positions(T212TestSupport.credentials())).hasSize(1);

        String expected = "Basic " + Base64.getEncoder().encodeToString((API_KEY + ":" + API_SECRET)
                .getBytes(StandardCharsets.UTF_8));
        assertThat(routes.requests()).hasSize(2).allSatisfy(request -> {
            assertThat(request.getMethod()).isEqualTo("GET");
            assertThat(request.getHeaders().get("Authorization")).isEqualTo(expected);
        });
    }

    @Test
    void legacyKeysAreSentAsTheRawHeader() {
        routes.on("/api/v0/equity/account/summary", json("t212/account-summary.json"));

        client.accountSummary(new T212Credentials(API_KEY, null, T212Environment.LIVE));

        assertThat(routes.requests().getFirst().getHeaders().get("Authorization")).isEqualTo(API_KEY);
    }

    @Test
    void mapsErrorStatuses() {
        routes.on("/api/v0/equity/account/summary", body(401, "{}"))
                .on("/api/v0/equity/positions", body(403, "{}"))
                .on("/api/v0/equity/metadata/instruments", body(400, "{}"));

        assertThatThrownBy(() -> client.accountSummary(T212TestSupport.credentials()))
                .isInstanceOfSatisfying(T212Exception.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNAUTHORIZED));
        assertThatThrownBy(() -> client.positions(T212TestSupport.credentials()))
                .isInstanceOfSatisfying(T212Exception.class, e -> assertThat(e.kind()).isEqualTo(Kind.FORBIDDEN));
        assertThatThrownBy(() -> client.instruments(T212TestSupport.credentials()))
                .isInstanceOfSatisfying(T212Exception.class, e -> assertThat(e.kind()).isEqualTo(Kind.BAD_RESPONSE));
        assertThat(routes.requests()).hasSize(3); // no retries for these
    }

    @Test
    void retriesServerErrorsWithBackoff() {
        AtomicInteger calls = new AtomicInteger();
        routes.on("/api/v0/equity/account/summary", request -> calls.incrementAndGet() < 3
                ? body(503, "{}") : json("t212/account-summary.json"));

        assertThat(client.accountSummary(T212TestSupport.credentials()).path("id").longValue()).isEqualTo(12345678L);
        assertThat(sleeper.sleeps()).containsExactly(Duration.ofSeconds(1), Duration.ofSeconds(2));
    }

    @Test
    void waitsForTheResetAfterA429AndRetries() {
        long reset = NOW.plusSeconds(40).getEpochSecond();
        AtomicInteger calls = new AtomicInteger();
        routes.on("/api/v0/equity/history/orders", request -> calls.incrementAndGet() == 1
                ? rateLimited(429, reset) : json("t212/empty-page.json"));

        T212Client.Page page = client.historyPage(T212TestSupport.credentials(),
                T212Client.History.ORDERS.firstPage(50));

        assertThat(page.items()).isEmpty();
        assertThat(page.nextPagePath()).isNull();
        assertThat(sleeper.sleeps()).containsExactly(Duration.ofSeconds(40));
        assertThat(calls).hasValue(2);
    }

    @Test
    void waitsBeforeTheNextCallWhenNothingIsLeft() {
        long reset = NOW.plusSeconds(20).getEpochSecond();
        routes.on("/api/v0/equity/history/dividends", request -> withRateHeaders(json("t212/empty-page.json"),
                0, reset));

        client.historyPage(T212TestSupport.credentials(), T212Client.History.DIVIDENDS.firstPage(50));
        assertThat(sleeper.sleeps()).isEmpty();
        client.historyPage(T212TestSupport.credentials(), T212Client.History.DIVIDENDS.firstPage(50));

        assertThat(sleeper.sleeps()).containsExactly(Duration.ofSeconds(20));
    }

    @Test
    void failsInsteadOfWaitingTooLong() {
        long reset = NOW.plusSeconds(600).getEpochSecond();
        routes.on("/api/v0/equity/history/transactions", request -> rateLimited(429, reset));

        assertThatThrownBy(() -> client.historyPage(T212TestSupport.credentials(),
                T212Client.History.TRANSACTIONS.firstPage(50)))
                .isInstanceOfSatisfying(T212Exception.class, e -> {
                    assertThat(e.kind()).isEqualTo(Kind.RATE_LIMITED);
                    assertThat(e.retryAt()).isEqualTo(Instant.ofEpochSecond(reset));
                });
        assertThat(sleeper.sleeps()).isEmpty();
    }

    @Test
    void rejectsNextPagePathsOutsideTheHistoryApi() {
        routes.on("/api/v0/equity/history/orders", body(200,
                "{\"items\":[],\"nextPagePath\":\"@evil.example.com/steal\"}"));

        assertThatThrownBy(() -> client.historyPage(T212TestSupport.credentials(),
                T212Client.History.ORDERS.firstPage(50)))
                .isInstanceOfSatisfying(T212Exception.class, e -> assertThat(e.kind()).isEqualTo(Kind.BAD_RESPONSE));
        assertThatThrownBy(() -> client.historyPage(T212TestSupport.credentials(), "/api/v0/equity/orders/limit"))
                .isInstanceOf(T212Exception.class);
        assertThat(routes.requests()).hasSize(1);
    }

    @Test
    void debugLogsRedactTheAuthorizationHeader(CapturedOutput output) {
        Logger logger = (Logger) LoggerFactory.getLogger(T212Client.class);
        Level previous = logger.getLevel();
        logger.setLevel(Level.DEBUG);
        try {
            routes.on("/api/v0/equity/account/summary", body(401, "{}"));
            assertThatThrownBy(() -> client.accountSummary(T212TestSupport.credentials()))
                    .hasMessageNotContaining(API_KEY).hasMessageNotContaining(API_SECRET);
        } finally {
            logger.setLevel(previous);
        }

        String header = T212TestSupport.credentials().authorizationHeader();
        assertThat(output.getAll()).contains("T212 request GET", "Authorization=[REDACTED]")
                .doesNotContain(API_KEY, API_SECRET, header, header.substring("Basic ".length()));
    }

    @Test
    void credentialsNeverShowInToString() {
        assertThat(T212TestSupport.credentials().toString()).doesNotContain(API_KEY, API_SECRET).contains("WXYZ");
    }

    private static MockResponse rateLimited(int status, long resetEpoch) {
        return withRateHeaders(body(status, "{}"), 0, resetEpoch);
    }

    private static MockResponse withRateHeaders(MockResponse response, int remaining, long resetEpoch) {
        return response.newBuilder()
                .addHeader("x-ratelimit-limit", "20")
                .addHeader("x-ratelimit-period", "60")
                .addHeader("x-ratelimit-remaining", String.valueOf(remaining))
                .addHeader("x-ratelimit-reset", String.valueOf(resetEpoch))
                .addHeader("x-ratelimit-used", "20")
                .build();
    }
}
