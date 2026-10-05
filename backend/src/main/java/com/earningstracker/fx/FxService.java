package com.earningstracker.fx;

import java.time.Duration;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;

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
 * in {@code fx/latest}. When the refresh fails, the last known rates are used. Historical daily rates (for
 * converting a trade at the rate of its day) are cached per currency in {@code fx-history/<currency>}.
 */
@Service
public class FxService {

    /** Rates to USD for every non-USD trading currency of the supported exchanges. */
    public record FxRates(Map<String, Double> usdPerUnit) {
    }

    /** Daily closing rates to USD of one currency, keyed by ISO date. */
    public record FxHistory(Map<String, Double> usdPerUnit) {
    }

    static final List<String> CURRENCIES = List.of("EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK");
    /** How far back the history goes; older dates have no rate. */
    static final LocalDate HISTORY_START = LocalDate.of(2012, 1, 1);
    /** The last close before a date is used for weekends and holidays, but not across a longer gap. */
    private static final int MAX_GAP_DAYS = 7;
    private static final Logger log = LoggerFactory.getLogger(FxService.class);

    private final TieredCache cache;
    private final TieredCache.Policy<FxRates> policy;
    private final TieredCache.Policy<FxHistory> historyPolicy;
    private final FxRateProvider provider;
    /** Parsed histories, reused while the cache hands out the same instance. */
    private final Map<String, Parsed> parsed = new ConcurrentHashMap<>();

    private record Parsed(FxHistory source, NavigableMap<LocalDate, Double> rates) {
    }

    public FxService(TieredCache cache, FxRateProvider provider) {
        this.cache = cache;
        this.policy = cache.policy("fx", FxRates.class, Duration.ofHours(24), true);
        this.historyPolicy = cache.policy("fx-history", FxHistory.class, Duration.ofHours(24), true);
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

    /**
     * Units of {@code to} per unit of {@code from} at the close of {@code date} (or the last close before it);
     * null when either currency has no rate for that day. Both must be major currencies (no pence).
     */
    public Double rateOn(String from, String to, LocalDate date) {
        if (from == null || to == null || date == null) {
            return null;
        }
        if (from.equalsIgnoreCase(to)) {
            return 1.0;
        }
        Double fromUsd = usdPerUnitOn(from.toUpperCase(), date);
        Double toUsd = usdPerUnitOn(to.toUpperCase(), date);
        return fromUsd == null || toUsd == null || toUsd == 0 ? null : fromUsd / toUsd;
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

    private Double usdPerUnitOn(String currency, LocalDate date) {
        if ("USD".equals(currency)) {
            return 1.0;
        }
        NavigableMap<LocalDate, Double> history = history(currency);
        Map.Entry<LocalDate, Double> entry = history.floorEntry(date);
        if (entry != null && !entry.getKey().plusDays(MAX_GAP_DAYS).isBefore(date)) {
            return entry.getValue();
        }
        // Newer than the cached history (e.g. a trade made today): today's rate is the rate of that day.
        if (!history.isEmpty() && date.isAfter(history.lastKey())) {
            return rates().get(currency);
        }
        return null;
    }

    private NavigableMap<LocalDate, Double> history(String currency) {
        try {
            FxHistory stored = cache.get(historyPolicy, currency, () -> fetchHistory(currency)).value();
            Parsed known = parsed.get(currency);
            if (known != null && known.source() == stored) {
                return known.rates();
            }
            NavigableMap<LocalDate, Double> history = new TreeMap<>();
            stored.usdPerUnit().forEach((date, rate) -> history.put(LocalDate.parse(date), rate));
            parsed.put(currency, new Parsed(stored, history));
            return history;
        } catch (RuntimeException e) {
            log.warn("No FX history for {}: {}", currency, e.getMessage());
            return new TreeMap<>();
        }
    }

    private FxHistory fetchHistory(String currency) {
        Map<String, Double> rates = new LinkedHashMap<>();
        provider.dailyUsdPerUnit(currency, HISTORY_START).forEach((date, rate) -> rates.put(date.toString(), rate));
        return new FxHistory(rates);
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
