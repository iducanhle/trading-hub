package com.earningstracker.t212;

import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.fixture;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static com.earningstracker.provider.t212.T212TestSupport.API_KEY;
import static com.earningstracker.provider.t212.T212TestSupport.API_SECRET;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Map;

import com.earningstracker.cache.InMemoryDocumentStore;
import com.earningstracker.provider.ProviderTestSupport.Routes;
import com.earningstracker.provider.t212.T212Client;
import com.earningstracker.provider.t212.T212Environment;
import com.earningstracker.provider.t212.T212TestSupport;
import com.earningstracker.provider.t212.T212TestSupport.MutableClock;
import com.earningstracker.provider.t212.T212TestSupport.RecordingSleeper;
import com.earningstracker.web.dto.T212Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import mockwebserver3.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class T212ConnectionServiceTest {

    private static final T212Dtos.CredentialsRequest REQUEST = new T212Dtos.CredentialsRequest("  " + API_KEY + " ",
            API_SECRET, T212Environment.DEMO);

    private final MockWebServer server = new MockWebServer();
    private final Routes routes = new Routes();
    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-02T10:00:00Z"));
    private final InMemoryDocumentStore store = new InMemoryDocumentStore();
    private String baseUrl;
    private T212ConnectionService service;

    @BeforeEach
    void start() throws Exception {
        server.setDispatcher(routes);
        server.start();
        baseUrl = server.url("/").toString().replaceAll("/$", "");
        allPermissions();
        service = service(T212TestSupport.MASTER_KEY);
    }

    @AfterEach
    void stop() {
        server.close();
    }

    private T212ConnectionService service(String masterKey) {
        T212Properties properties = T212TestSupport.properties(baseUrl, masterKey);
        T212Encryption encryption = new T212Encryption(properties);
        return new T212ConnectionService(new T212Client(properties, JSON, clock, new RecordingSleeper(clock)),
                new T212CredentialStore(store, encryption, clock), new T212StateStore(store), encryption, properties,
                clock);
    }

    private void allPermissions() {
        routes.on("/api/v0/equity/account/summary", json("t212/account-summary.json"))
                .on("/api/v0/equity/positions", json("t212/positions.json"))
                .on("/api/v0/equity/history/", json("t212/empty-page.json"));
    }

    @Test
    void notConnectedUntilAKeyIsSaved() {
        T212Dtos.Status status = service.status("uid-1");

        assertThat(status.connected()).isFalse();
        assertThat(status.syncState()).isEqualTo("IDLE");
        assertThat(status.serverIpHint()).isEqualTo("203.0.113.7");
        assertThatThrownBy(() -> service.requireCredentials("uid-1")).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.code()).isEqualTo(ErrorCode.T212_NOT_CONNECTED));
    }

    @Test
    void connectChecksEveryPermissionThenStoresTheKeyEncrypted() {
        T212Dtos.Status status = service.connect("uid-1", REQUEST);

        assertThat(status.connected()).isTrue();
        assertThat(status.environment()).isEqualTo(T212Environment.DEMO);
        assertThat(status.keyHint()).isEqualTo("WXYZ");
        assertThat(status.accountCurrency()).isEqualTo("EUR");
        assertThat(status.credentialsValid()).isTrue();
        assertThat(status.connectedAt()).isEqualTo(clock.instant());
        assertThat(routes.requests()).extracting(r -> r.getUrl().encodedPath()).containsExactly(
                "/api/v0/equity/account/summary", "/api/v0/equity/positions", "/api/v0/equity/history/orders",
                "/api/v0/equity/history/dividends", "/api/v0/equity/history/transactions");

        Map<String, Object> stored = store.peek("t212Credentials", "uid-1").orElseThrow();
        assertThat(stored.toString()).doesNotContain(API_KEY, API_SECRET);
        assertThat(store.peek("t212", "uid-1").orElseThrow().toString()).doesNotContain(API_KEY, "12345678");
        assertThat(service.requireCredentials("uid-1").apiKey()).isEqualTo(API_KEY); // trimmed
        assertThat(status.toString()).doesNotContain(API_KEY, API_SECRET);
    }

    @Test
    void listsEveryMissingPermission() {
        routes.on("/api/v0/equity/positions", body(403, "{}"))
                .on("/api/v0/equity/history/dividends", body(403, "{}"));

        assertThatThrownBy(() -> service.connect("uid-1", REQUEST)).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.code()).isEqualTo(ErrorCode.T212_MISSING_PERMISSIONS);
            assertThat(e.getMessage()).contains("portfolio, history:dividends");
        });
        assertThat(store.peek("t212Credentials", "uid-1")).isEmpty();
    }

    @Test
    void aRejectedKeyIsNotStored() {
        routes.on("/api/v0/equity/account/summary", body(401, "{}"));

        assertThatThrownBy(() -> service.connect("uid-1", REQUEST)).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.code()).isEqualTo(ErrorCode.T212_INVALID_CREDENTIALS);
            assertThat(e.getMessage()).doesNotContain(API_KEY, API_SECRET);
        });
        assertThat(store.peek("t212Credentials", "uid-1")).isEmpty();
        assertThat(store.peek("t212", "uid-1")).isEmpty();
    }

    @Test
    void validatesTheRequest() {
        assertBadRequest(new T212Dtos.CredentialsRequest(" ", API_SECRET, T212Environment.LIVE));
        assertBadRequest(new T212Dtos.CredentialsRequest(API_KEY, API_SECRET, null));
        assertBadRequest(new T212Dtos.CredentialsRequest("x".repeat(201), API_SECRET, T212Environment.LIVE));
        assertBadRequest(new T212Dtos.CredentialsRequest(API_KEY, "line\nbreak", T212Environment.LIVE));
        assertThat(routes.requests()).isEmpty();
    }

    private void assertBadRequest(T212Dtos.CredentialsRequest request) {
        assertThatThrownBy(() -> service.connect("uid-1", request)).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.code()).isEqualTo(ErrorCode.BAD_REQUEST));
    }

    @Test
    void replacingTheKeyKeepsDataForTheSameAccountOnly() {
        service.connect("uid-1", REQUEST);
        store.set("t212/uid-1/orders", "2026-09", Map.of("items", java.util.List.of()));
        clock.advance(java.time.Duration.ofDays(1));

        service.connect("uid-1", REQUEST);
        assertThat(store.peek("t212/uid-1/orders", "2026-09")).isPresent();
        assertThat(service.status("uid-1").connectedAt()).isEqualTo(Instant.parse("2026-10-02T10:00:00Z"));

        routes.on("/api/v0/equity/account/summary", body(200,
                fixture("t212/account-summary.json").replace("12345678", "87654321")));
        service.connect("uid-1", REQUEST);
        assertThat(store.peek("t212/uid-1/orders", "2026-09")).isEmpty();
        assertThat(service.status("uid-1").connectedAt()).isEqualTo(clock.instant());
    }

    @Test
    void disconnectDeletesTheKeyAndAllSyncedData() {
        service.connect("uid-1", REQUEST);
        service.connect("uid-2", REQUEST);
        store.set("t212/uid-1/orders", "2026-09", Map.of("items", java.util.List.of()));
        store.set("t212/uid-1/dividends", "2026", Map.of("items", java.util.List.of()));

        service.disconnect("uid-1");
        service.disconnect("uid-1"); // idempotent

        assertThat(store.peek("t212Credentials", "uid-1")).isEmpty();
        assertThat(store.peek("t212", "uid-1")).isEmpty();
        assertThat(store.peek("t212/uid-1/orders", "2026-09")).isEmpty();
        assertThat(store.peek("t212/uid-1/dividends", "2026")).isEmpty();
        assertThat(service.status("uid-1").connected()).isFalse();
        assertThat(service.status("uid-2").connected()).isTrue();
    }

    @Test
    void aChangedMasterKeyAsksTheUserToReconnect() {
        service.connect("uid-1", REQUEST);
        T212ConnectionService restarted = service(T212CryptoTest.OTHER_MASTER_KEY);

        T212Dtos.Status status = restarted.status("uid-1");
        assertThat(status.connected()).isTrue();
        assertThat(status.credentialsValid()).isFalse();
        assertThat(status.syncState()).isEqualTo("FAILED");
        assertThat(status.lastError().code()).isEqualTo("T212_INVALID_CREDENTIALS");
        assertThatThrownBy(() -> restarted.requireCredentials("uid-1")).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.code()).isEqualTo(ErrorCode.T212_INVALID_CREDENTIALS));

        restarted.connect("uid-1", REQUEST);
        assertThat(restarted.status("uid-1").credentialsValid()).isTrue();
    }

    @Test
    void withoutAMasterKeyEverythingAnswersNotConfigured() {
        T212ConnectionService off = service("");

        assertThatThrownBy(() -> off.status("uid-1")).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.code()).isEqualTo(ErrorCode.T212_NOT_CONFIGURED));
        assertThatThrownBy(() -> off.connect("uid-1", REQUEST)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> off.disconnect("uid-1")).isInstanceOf(ApiException.class);
        assertThat(routes.requests()).isEmpty();
    }
}
