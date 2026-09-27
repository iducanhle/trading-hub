package com.earningstracker.service;

import java.net.URI;
import java.time.Duration;
import java.util.Optional;

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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Company profiles in {@code symbols/{symbol}}, fresh for 7 days. Fields the answering provider lacks (Finnhub has
 * no sector) are filled from the next provider in the chain. Logos fall back to the website's favicon.
 */
@Service
public class ProfileService {

    static final Duration FRESH_FOR = Duration.ofDays(7);
    private static final Logger log = LoggerFactory.getLogger(ProfileService.class);

    private final TieredCache cache;
    private final TieredCache.Policy<StockProfile> policy;
    private final ProviderRouter router;
    private final FxService fx;

    public ProfileService(TieredCache cache, ProviderRouter router, FxService fx) {
        this.cache = cache;
        this.policy = cache.policy("symbols", StockProfile.class, FRESH_FOR, true);
        this.router = router;
        this.fx = fx;
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

    /** Fetches now and stores (jobs: market caps of followed symbols are refreshed daily). */
    public StockProfile refresh(String symbol) {
        StockProfile profile = load(symbol);
        cache.put(policy, symbol, profile);
        return profile;
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
        return new StockProfile(symbol, profile.name(), profile.exchange(), profile.currency(),
                profile.financialCurrency(), sector, industry, website,
                profile.logoUrl() != null ? profile.logoUrl() : faviconFor(website),
                profile.marketCap(), fx.toUsd(profile.marketCap(), profile.currency()),
                profile.week52High(), profile.week52Low(), profile.peRatio(), profile.epsTtm(), profile.avgVolume());
    }

    /** {@code https://www.google.com/s2/favicons?domain={domain}&sz=128}, or null without a usable website. */
    static String faviconFor(String website) {
        if (website == null || website.isBlank()) {
            return null;
        }
        try {
            String host = URI.create(website.contains("://") ? website.strip() : "https://" + website.strip()).getHost();
            return host == null ? null
                    : "https://www.google.com/s2/favicons?domain=" + host.replaceFirst("^www\\.", "") + "&sz=128";
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
