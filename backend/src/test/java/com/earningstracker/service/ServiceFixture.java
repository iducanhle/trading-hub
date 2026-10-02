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
import com.earningstracker.market.IntradayBar;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Region;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.IntradayProvider;
import com.earningstracker.provider.ProviderRouter;
import com.earningstracker.provider.ProviderSettings;
import com.earningstracker.provider.ProviderTestSupport;
import com.google.common.util.concurrent.MoreExecutors;

/** The real service graph around a {@link FakeProvider}, an in-memory store and a movable clock. */
public class ServiceFixture {

    public static final class MutableClock extends Clock {
        private Instant now;

        public MutableClock(Instant now) {
            this.now = now;
        }

        public void set(Instant instant) {
            now = instant;
        }

        public void advance(Duration duration) {
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

    /** Sunday 2026-09-27 10:00 UTC. */
    public final MutableClock clock = new MutableClock(Instant.parse("2026-09-27T10:00:00Z"));
    public final InMemoryDocumentStore store = new InMemoryDocumentStore();
    public final FakeProvider provider = new FakeProvider();
    public final ExecutorService executor = MoreExecutors.newDirectExecutorService();
    public final TieredCache cache = new TieredCache(store, ProviderTestSupport.JSON, clock);
    public final ProviderRouter router = new ProviderRouter(List.of(provider), new ProviderSettings(allChains(), null));
    public final FxService fx = new FxService(cache, provider);
    public final ProfileService profiles = new ProfileService(cache, router, fx, clock);
    public final QuoteService quotes = new QuoteService(cache, router);
    public final PriceService prices = new PriceService(cache, router, ProviderTestSupport.JSON, clock);
    public final EarningsService earnings = new EarningsService(cache, router, ProviderTestSupport.JSON, executor);
    public final StockExtrasService extras = new StockExtrasService(cache, router, ProviderTestSupport.JSON);
    public final ViewTracker views = new ViewTracker(store, executor, clock);
    public final FollowService follows = new FollowService(store, cache, ProviderTestSupport.JSON);
    /** 5-minute bars the fake intraday provider answers with, by symbol. */
    public final Map<String, List<IntradayBar>> intradayBars = new java.util.concurrent.ConcurrentHashMap<>();
    public final IntradayService intraday = new IntradayService(List.of(new IntradayProvider() {
        @Override
        public String id() {
            return "fake";
        }

        @Override
        public List<IntradayBar> intradayBars(String symbol) {
            return intradayBars.getOrDefault(symbol, List.of());
        }
    }), clock);
    public final StockService stocks = new StockService(profiles, quotes, prices, intraday, earnings, extras, views,
            new EarningsProperties(5), executor, clock);
    public final CalendarService calendar = new CalendarService(store, follows, ProviderTestSupport.JSON, clock);
    public final FollowedEarningsService followed = new FollowedEarningsService(follows, earnings, profiles, clock);
    public final SearchService search = new SearchService(cache, router, ProviderTestSupport.JSON, executor, profiles);

    private static Map<Capability, Map<Region, List<String>>> allChains() {
        Map<Capability, Map<Region, List<String>>> chains = new EnumMap<>(Capability.class);
        for (Capability capability : Capability.values()) {
            chains.put(capability, capability == Capability.EARNINGS_CALENDAR
                    ? Map.of(Region.US, List.of("fake"), Region.EU, List.of())
                    : Map.of(Region.US, List.of("fake"), Region.EU, List.of("fake")));
        }
        return chains;
    }

    /** Bars on every weekday; bar i has close 100 + i (open 0.5 lower). */
    public static List<PriceBar> weekdays(String from, String to) {
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
