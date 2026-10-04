package com.earningstracker.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.fx.FxService;
import com.earningstracker.market.CompanyProfile;
import com.earningstracker.market.Region;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.Capability;
import com.earningstracker.provider.ProfileProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderRouter;
import com.earningstracker.provider.Sourced;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Company profiles in {@code symbols/{symbol}}, fresh for 7 days. Fields the answering provider lacks (Finnhub has
 * no sector) are filled from the next provider in the chain.
 */
@Service
public class ProfileService {

    static final Duration FRESH_FOR = Duration.ofDays(7);
    static final Duration UNKNOWN_FOR = Duration.ofHours(6);
    private static final Logger log = LoggerFactory.getLogger(ProfileService.class);

    private final TieredCache cache;
    private final TieredCache.Policy<StockProfile> policy;
    private final ProviderRouter router;
    private final FxService fx;
    private final Clock clock;
    /** Symbols {@link #logos} found no stored profile for; forgotten when one is stored. */
    private final Cache<String, Boolean> unknown = Caffeine.newBuilder()
            .expireAfterWrite(UNKNOWN_FOR)
            .maximumSize(10_000)
            .build();

    public ProfileService(TieredCache cache, ProviderRouter router, FxService fx, Clock clock) {
        this.cache = cache;
        this.policy = cache.policy("symbols", StockProfile.class, ProfileService::isFresh, FRESH_FOR.multipliedBy(2),
                true);
        this.router = router;
        this.fx = fx;
        this.clock = clock;
    }

    /**
     * Fresh for {@link #FRESH_FOR}. A US profile in another currency is never fresh: it came from an ADR's home
     * listing (Finnhub resolved SKHY to 000660.KS in KRW) before that was rejected, so it is loaded again.
     */
    static boolean isFresh(StockProfile profile, Instant fetchedAt, Instant now) {
        if (Symbols.region(profile.symbol()) == Region.US && !"USD".equals(profile.currency())) {
            return false;
        }
        return fetchedAt.plus(FRESH_FOR).isAfter(now);
    }

    public Cached<StockProfile> profile(String symbol) {
        return cache.get(policy, symbol, () -> load(symbol));
    }

    /** Cached profile (L1 or Firestore), without calling providers. */
    public Optional<StockProfile> stored(String symbol) {
        return cache.stored(policy, symbol).map(Cached::value);
    }

    /** Cached profile from memory only; for per-item enrichment of lists. */
    public Optional<StockProfile> peek(String symbol) {
        return cache.peek(policy, symbol);
    }

    /**
     * Logos of stored profiles (memory, then one batched Firestore read), for lists such as search results and
     * peers; never calls providers. Symbols without a stored profile are remembered for a while so repeated
     * searches don't read them again.
     */
    public Map<String, String> logos(Collection<String> symbols) {
        List<String> wanted = symbols.stream().distinct().filter(s -> unknown.getIfPresent(s) == null).toList();
        Map<String, StockProfile> stored = cache.storedAll(policy, wanted);
        Map<String, String> logos = new HashMap<>();
        for (String symbol : wanted) {
            StockProfile profile = stored.get(symbol);
            if (profile == null) {
                unknown.put(symbol, Boolean.TRUE);
            } else if (profile.logoUrl() != null) {
                logos.put(symbol, profile.logoUrl());
            }
        }
        return logos;
    }

    /** Fetches now and stores (jobs: market caps of followed symbols are refreshed daily). */
    public StockProfile refresh(String symbol) {
        StockProfile profile = load(symbol);
        cache.put(policy, symbol, profile);
        return profile;
    }

    /**
     * Market cap and logo for the calendar job: a stored profile younger than {@code maxAge} is reused; otherwise
     * the cheap {@code basics} call is made while {@code budget} lasts. The result is stored as if it were
     * already {@link #FRESH_FOR} old, so the stock page still fetches the full profile with key stats.
     */
    public Optional<StockProfile> basics(String symbol, Duration maxAge, AtomicInteger budget) {
        Optional<Cached<StockProfile>> stored = cache.stored(policy, symbol);
        if (stored.isPresent() && stored.get().fetchedAt().isAfter(clock.instant().minus(maxAge))) {
            return Optional.of(stored.get().value());
        }
        if (budget.getAndDecrement() <= 0) {
            return stored.map(Cached::value);
        }
        try {
            CompanyProfile basic = router.<ProfileProvider, CompanyProfile>first(Capability.PROFILE,
                    Symbols.region(symbol), p -> p.basics(symbol)).value();
            StockProfile profile = toProfile(symbol, basic, basic.sector(), basic.industry(), basic.website());
            cache.put(policy, symbol, profile, clock.instant().minus(FRESH_FOR));
            unknown.invalidate(symbol);
            return Optional.of(profile);
        } catch (ProviderException e) {
            log.debug("No basics for {}: {}", symbol, e.getMessage());
            return stored.map(Cached::value);
        }
    }

    private StockProfile load(String symbol) {
        Region region = Symbols.region(symbol);
        Sourced<CompanyProfile> primary = router.first(Capability.PROFILE, region, (ProfileProvider p) -> p.profile(symbol));
        CompanyProfile profile = primary.value();
        String sector = profile.sector();
        String industry = profile.industry();
        String website = profile.website();
        if (sector == null || website == null) {
            boolean afterPrimary = false;
            for (ProfileProvider next : router.<ProfileProvider>chain(Capability.PROFILE, region)) {
                if (!afterPrimary) {
                    afterPrimary = next.id().equals(primary.provider());
                    continue;
                }
                try {
                    CompanyProfile extra = next.profile(symbol);
                    if (sector == null && extra.sector() != null) {
                        // Take the pair: a primary without sector (Finnhub) only has a coarse industry label.
                        sector = extra.sector();
                        industry = extra.industry() != null ? extra.industry() : industry;
                    }
                    website = website != null ? website : extra.website();
                    break;
                } catch (ProviderException e) {
                    log.debug("No profile fill-in for {} from {}: {}", symbol, next.id(), e.getMessage());
                }
            }
        }
        unknown.invalidate(symbol);
        return toProfile(symbol, profile, sector, industry, website);
    }

    private StockProfile toProfile(String symbol, CompanyProfile profile, String sector, String industry,
            String website) {
        return new StockProfile(symbol, profile.name(), profile.exchange(), profile.currency(),
                profile.financialCurrency(), sector, industry, website,
                profile.logoUrl(), profile.marketCap(), fx.toUsd(profile.marketCap(), profile.currency()),
                profile.week52High(), profile.week52Low(), profile.peRatio(), profile.epsTtm(), profile.avgVolume());
    }
}
