package com.earningstracker.provider.http;

import static com.earningstracker.provider.ProviderTestSupport.CLOCK;
import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.httpFactory;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import mockwebserver3.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ProviderHttpTest {

    private final MockWebServer server = new MockWebServer();

    @BeforeEach
    void start() throws Exception {
        server.start();
    }

    @AfterEach
    void stop() {
        server.close();
    }

    private ProviderHttp http(int dailyLimit) {
        return httpFactory(CLOCK).create("test", server.url("/").toString(), Duration.ofMillis(1), dailyLimit, null,
                null, builder -> {
                });
    }

    @Test
    void retriesTransientFailuresThenSucceeds() {
        server.enqueue(body(503, "busy"));
        server.enqueue(body(429, "slow down"));
        server.enqueue(body(200, "{\"ok\":true}"));

        assertThat(http(0).getJson("/x").path("ok").booleanValue()).isTrue();
        assertThat(server.getRequestCount()).isEqualTo(3);
    }

    @Test
    void doesNotRetryPermanentFailures() {
        server.enqueue(body(404, "{\"error\":\"unknown\"}"));

        assertThatThrownBy(() -> http(0).getJson("/x"))
                .isInstanceOfSatisfying(ProviderException.class, e -> {
                    assertThat(e.kind()).isEqualTo(Kind.NOT_FOUND);
                    assertThat(e.getMessage()).contains("HTTP 404");
                });
        assertThat(server.getRequestCount()).isEqualTo(1);
    }

    @Test
    void givesUpAfterMaxAttempts() {
        for (int i = 0; i < 3; i++) {
            server.enqueue(body(500, "down"));
        }

        assertThatThrownBy(() -> http(0).getJson("/x"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.UNAVAILABLE));
        assertThat(server.getRequestCount()).isEqualTo(3);
    }

    @Test
    void stopsWhenTheDailyQuotaIsUsedUp() {
        server.enqueue(body(200, "{}"));
        ProviderHttp http = http(1);
        http.getJson("/x");

        assertThatThrownBy(() -> http.getJson("/x"))
                .isInstanceOfSatisfying(ProviderException.class, e -> {
                    assertThat(e.kind()).isEqualTo(Kind.RATE_LIMITED);
                    assertThat(e.isRetryable()).isFalse();
                });
        assertThat(server.getRequestCount()).isEqualTo(1);
    }

    @Test
    void rejectsNonJsonBodies() {
        server.enqueue(body(200, "<html>oops</html>"));

        assertThatThrownBy(() -> http(0).getJson("/x"))
                .isInstanceOfSatisfying(ProviderException.class, e -> assertThat(e.kind()).isEqualTo(Kind.BAD_RESPONSE));
    }

    @Test
    void spacesCallsByTheMinimumInterval() {
        for (int i = 0; i < 3; i++) {
            server.enqueue(body(200, "{}"));
        }
        ProviderHttp http = httpFactory(CLOCK).create("spaced", server.url("/").toString(), Duration.ofMillis(150),
                0, null, null, builder -> {
                });

        long start = System.nanoTime();
        for (int i = 0; i < 3; i++) {
            http.getJson("/x");
        }

        assertThat(Duration.ofNanos(System.nanoTime() - start)).isGreaterThanOrEqualTo(Duration.ofMillis(250));
    }
}
