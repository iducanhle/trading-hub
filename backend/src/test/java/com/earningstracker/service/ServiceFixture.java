package com.earningstracker.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;

import com.earningstracker.cache.InMemoryDocumentStore;
import com.earningstracker.cache.TieredCache;
import com.earningstracker.fx.FxService;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Region;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.ProviderRouter;
import com.earningstracker.provider.ProviderSettings;
import com.earningstracker.provider.ProviderTestSupport;
import com.google.common.util.concurrent.MoreExecutors;

/** The real service graph around a {@link FakeProvider}, an in-memory store and a movable clock. */
class ServiceFixture {

    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void set(Instant instant) {
            now = instant;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            MutableClock outer = this;
            return new Clock() {
                @Override
                public ZoneId getZone() {
                    return zone;
                }

                @Override
                public Clock withZone(ZoneId other) {
                    return outer.withZone(other);
                }

                @Override
                public Instant instant() {
                    return outer.instant();
                }
            };
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    /** Saturday 2026-09-27 10:00 UTC. */
    final MutableClock clock = new MutableClock(Instant.parse("2026-09-27T10:00:00Z"));
    final InMemoryDocumentStore store = new InMemoryDocumentStore();
    final FakeProvider provider = new FakeProvider();
    final ExecutorService executor = MoreExecutors.newDirectExecutorService();
    final TieredCache cache = new TieredCache(store, ProviderTestSupport.JSON, clock);
    final ProviderRouter router = new ProviderRouter(List.of(provider), new ProviderSettings(allChains(), null));
    final FxService fx = new FxService(cache, provider);
    final ProfileService profiles = new ProfileService(cache, router, fx);
    final QuoteService quotes = new QuoteService(cache, router);
    final PriceService prices = new PriceService(cache, router, ProviderTestSupport.JSON, clock);
    final EarningsService earnings = new EarningsService(cache, router, ProviderTestSupport.JSON, executor);
    final StockExtrasService extras = new StockExtrasService(cache, router, ProviderTestSupport.JSON);
    final ViewTracker views = new ViewTracker(store, executor, clock);
    final FollowService follows = new FollowService(store, cache, ProviderTestSupport.JSON);
    final StockService stocks = new StockService(profiles, quotes, prices, earnings, extras, views,
            new EarningsProperties(5), executor, clock);
    final CalendarService calendar = new CalendarService(store, follows, ProviderTestSupport.JSON, clock);
    final FollowedEarningsService followed = new FollowedEarningsService(follows, earnings, profiles, clock);
    final SearchService search = new SearchService(cache, router, ProviderTestSupport.JSON, executor, profiles);

    private static Map<Capability, Map<Region, List<String>>> allChains() {
        Map<Capability, Map<Region, List<String>>> chains = new EnumMap<>(Capability.class);
        for (Capability capability : Capability.values()) {
            if (capability != Capability.EARNINGS_CALENDAR) {
                chains.put(capability, Map.of(Region.US, List.of("fake"), Region.EU, List.of("fake")));
            }
        }
        return chains;
    }

    /** Bars on every weekday; bar i has close 100 + i (open 0.5 lower). */
    static List<PriceBar> weekdays(String from, String to) {
        List<PriceBar> bars = new ArrayList<>();
        int i = 0;
        for (LocalDate d = LocalDate.parse(from); !d.isAfter(LocalDate.parse(to)); d = d.plusDays(1)) {
            if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
                bars.add(new PriceBar(d, 100 + i - 0.5, 100 + i + 1, 100 + i - 1, 100 + i, 1000 + i));
                i++;
            }
        }
        return bars;
    }
}
