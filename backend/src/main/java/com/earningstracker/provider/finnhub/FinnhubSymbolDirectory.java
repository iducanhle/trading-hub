package com.earningstracker.provider.finnhub;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.earningstracker.market.Exchange;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.http.ProviderHttp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;

/**
 * Finnhub's US symbol list ({@code /stock/symbol?exchange=US}, ~31k entries, one call per day), reduced to
 * equities on NYSE, NASDAQ and NYSE American. Gives search results and calendar events their exchange, and
 * filters out OTC tickers.
 */
class FinnhubSymbolDirectory {

    record Listing(String name, Exchange exchange) {
    }

    static final Set<String> EQUITY_TYPES = Set.of("Common Stock", "ADR", "REIT", "NY Reg Shrs");
    private static final Map<String, Exchange> EXCHANGES_BY_MIC =
            Map.of("XNYS", Exchange.NYSE, "XNAS", Exchange.NASDAQ, "XASE", Exchange.NYSE_AMERICAN);
    private static final Duration MAX_AGE = Duration.ofDays(1);
    private static final Logger log = LoggerFactory.getLogger(FinnhubSymbolDirectory.class);

    private final ProviderHttp http;
    private final Clock clock;
    private volatile Map<String, Listing> listings;
    private volatile Instant loadedAt;

    FinnhubSymbolDirectory(ProviderHttp http, Clock clock) {
        this.http = http;
        this.clock = clock;
    }

    /** Null-safe: immutable sets throw on contains(null), and some entries have no type. */
    static boolean isEquity(String type) {
        return type != null && EQUITY_TYPES.contains(type);
    }

    private static Exchange exchangeForMic(String mic) {
        return mic == null ? null : EXCHANGES_BY_MIC.get(mic);
    }

    /** Listing of a canonical US symbol; empty if it is not an equity on a supported exchange. */
    Optional<Listing> find(String symbol) {
        return Optional.ofNullable(listings().get(symbol));
    }

    /** Loads the directory if needed; throws when Finnhub cannot provide it. */
    void requireLoaded() {
        listings();
    }

    /** The loaded listings, or empty when the directory cannot be loaded (callers then skip filtering). */
    Optional<Map<String, Listing>> ifAvailable() {
        try {
            return Optional.of(listings());
        } catch (ProviderException e) {
            return Optional.empty();
        }
    }

    private Map<String, Listing> listings() {
        Map<String, Listing> current = listings;
        if (current != null && loadedAt.plus(MAX_AGE).isAfter(clock.instant())) {
            return current;
        }
        synchronized (this) {
            if (listings != null && loadedAt.plus(MAX_AGE).isAfter(clock.instant())) {
                return listings;
            }
            try {
                listings = load();
                loadedAt = clock.instant();
            } catch (ProviderException e) {
                if (listings == null) {
                    throw e;
                }
                log.warn("Keeping the previous Finnhub symbol directory: {}", e.getMessage());
                loadedAt = clock.instant().minus(MAX_AGE).plus(Duration.ofHours(1)); // retry in an hour
            }
            return listings;
        }
    }

    private Map<String, Listing> load() {
        JsonNode all = http.getJson("/stock/symbol?exchange=US");
        Map<String, Listing> result = new HashMap<>();
        for (JsonNode entry : all) {
            Exchange exchange = exchangeForMic(Json.text(entry.path("mic")));
            String symbol = Json.text(entry.path("symbol"));
            if (exchange == null || symbol == null || !isEquity(Json.text(entry.path("type")))) {
                continue;
            }
            String canonical = Symbols.fromDotClass(symbol);
            if (Symbols.isValid(canonical)) {
                result.put(canonical, new Listing(Json.text(entry.path("description")), exchange));
            }
        }
        log.info("Loaded Finnhub symbol directory: {} US equities", result.size());
        return Map.copyOf(result);
    }
}
