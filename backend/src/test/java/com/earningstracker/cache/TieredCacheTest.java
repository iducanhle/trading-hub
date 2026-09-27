package com.earningstracker.cache;

import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.ReportTime;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JavaType;

class TieredCacheTest {

    /** A clock the test can move forward. */
    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-09-27T10:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static final List<EarningsReport> REPORTS = List.of(new EarningsReport("SAP.DE", LocalDate.of(2026, 10, 21),
            ReportTime.AMC, LocalDate.of(2026, 9, 30), 3, 2026, "EUR", 1.83, null, 10_088_648_850.0, null, true));

    private final MutableClock clock = new MutableClock();
    private final InMemoryDocumentStore store = new InMemoryDocumentStore();
    private final TieredCache cache = new TieredCache(store, JSON, clock);
    private final JavaType reportsType = JSON.getTypeFactory().constructCollectionType(List.class, EarningsReport.class);
    private final TieredCache.Policy<List<EarningsReport>> persistent =
            cache.policy("earnings", reportsType, Duration.ofDays(1), true);
    private final AtomicInteger loads = new AtomicInteger();

    private List<EarningsReport> load() {
        loads.incrementAndGet();
        return REPORTS;
    }

    private static List<EarningsReport> fail() {
        throw new ProviderException("yahoo", Kind.UNAVAILABLE, "down");
    }

    @Test
    void servesFromMemoryWhileFreshAndReloadsWhenStale() {
        cache.get(persistent, "SAP.DE", this::load);
        TieredCache.Cached<List<EarningsReport>> second = cache.get(persistent, "SAP.DE", this::load);
        assertThat(loads).hasValue(1);
        assertThat(second.stale()).isFalse();

        clock.advance(Duration.ofHours(25));
        cache.get(persistent, "SAP.DE", this::load);
        assertThat(loads).hasValue(2);
    }

    @Test
    void persistsToTheStoreAndRoundTripsAfterARestart() {
        cache.get(persistent, "SAP.DE", this::load);
        assertThat(store.peek("earnings", "SAP.DE")).isPresent();

        TieredCache restarted = new TieredCache(store, JSON, clock);
        TieredCache.Cached<List<EarningsReport>> fromStore = restarted.get(
                restarted.policy("earnings", reportsType, Duration.ofDays(1), true), "SAP.DE", this::load);

        assertThat(loads).hasValue(1);
        assertThat(fromStore.value()).isEqualTo(REPORTS);
        assertThat(fromStore.fetchedAt()).isEqualTo(Instant.parse("2026-09-27T10:00:00Z"));
    }

    @Test
    void servesStaleDataWhenTheProviderFails() {
        cache.get(persistent, "SAP.DE", this::load);
        clock.advance(Duration.ofDays(2));

        TieredCache.Cached<List<EarningsReport>> result = cache.get(persistent, "SAP.DE", TieredCacheTest::fail);

        assertThat(result.stale()).isTrue();
        assertThat(result.value()).isEqualTo(REPORTS);
    }

    @Test
    void failsWhenNothingIsCachedAndTheProviderFails() {
        assertThatThrownBy(() -> cache.get(persistent, "SAP.DE", TieredCacheTest::fail))
                .isInstanceOf(ProviderException.class);
    }

    @Test
    void memoryOnlyPoliciesNeverTouchTheStore() {
        TieredCache.Policy<String> quotes = cache.policy("quotes", String.class, Duration.ofSeconds(60), false);

        cache.get(quotes, "AAPL", () -> "341.07");

        assertThat(store.usage()).isEqualTo(new DocumentStore.Usage(0, 0));
    }

    @Test
    void storeFailuresDegradeToMemoryOnly() {
        store.failing(true);

        assertThat(cache.get(persistent, "SAP.DE", this::load).value()).isEqualTo(REPORTS);
        assertThat(cache.get(persistent, "SAP.DE", this::load).value()).isEqualTo(REPORTS);
        assertThat(loads).hasValue(1);
    }
}
