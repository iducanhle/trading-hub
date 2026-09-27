package com.earningstracker.fx;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.earningstracker.cache.TieredCache;
import com.earningstracker.market.Money;
import com.earningstracker.provider.FxRateProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Converts market caps to USD with daily rates for every currency of the supported exchanges, cached in L1 and
 * in {@code fx/latest}. When the refresh fails, the last known rates are used.
 */
@Service
public class FxService {

    /** Rates to USD for every non-USD trading currency of the supported exchanges. */
    public record FxRates(Map<String, Double> usdPerUnit) {
    }

    static final List<String> CURRENCIES = List.of("EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK");
    private static final Logger log = LoggerFactory.getLogger(FxService.class);

    private final TieredCache cache;
    private final TieredCache.Policy<FxRates> policy;
    private final FxRateProvider provider;

    public FxService(TieredCache cache, FxRateProvider provider) {
        this.cache = cache;
        this.policy = cache.policy("fx", FxRates.class, Duration.ofHours(24), true);
        this.provider = provider;
    }

    /** USD value of {@code amount} in {@code currency}; null if either is missing or no rate is available. */
    public Double toUsd(Double amount, String currency) {
        if (amount == null || currency == null) {
            return null;
        }
        double major = Money.toMajor(amount, currency);
        String code = Money.majorCurrency(currency);
        if ("USD".equals(code)) {
            return major;
        }
        Double rate = rates().get(code);
        return rate == null ? null : major * rate;
    }

    /** Current rates, possibly stale; empty if none could ever be fetched. */
    public Map<String, Double> rates() {
        try {
            return cache.get(policy, "latest", this::fetch).value().usdPerUnit();
        } catch (RuntimeException e) {
            log.warn("No FX rates available: {}", e.getMessage());
            return Map.of();
        }
    }

    /** Fetches fresh rates now (daily job). */
    public void refresh() {
        cache.put(policy, "latest", fetch());
    }

    private FxRates fetch() {
        Map<String, Double> rates = new LinkedHashMap<>();
        for (String currency : CURRENCIES) {
            try {
                rates.put(currency, provider.usdPerUnit(currency));
            } catch (ProviderException e) {
                log.warn("FX rate for {} unavailable: {}", currency, e.getMessage());
            }
        }
        if (rates.isEmpty()) {
            throw new ProviderException("fx", Kind.UNAVAILABLE, "no FX rate could be fetched");
        }
        return new FxRates(rates);
    }
}
