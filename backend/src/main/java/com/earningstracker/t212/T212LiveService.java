package com.earningstracker.t212;

import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.t212.T212Client;
import com.earningstracker.provider.t212.T212Credentials;
import com.earningstracker.provider.t212.T212Exception;
import com.earningstracker.provider.t212.T212Exception.Kind;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * Account summary and open positions, fetched from Trading 212 and reused per user for
 * {@code app.t212.live-cache-ttl} (they change with prices). When Trading 212 fails, the last good copy is
 * served as stale; with none, there are no live values. Concurrent requests of one user share one fetch.
 */
@Service
public class T212LiveService {

    private static final Logger log = LoggerFactory.getLogger(T212LiveService.class);

    private final T212Client client;
    private final T212ConnectionService connection;
    private final Clock clock;
    private final Cache<String, T212Live> fresh;
    private final Map<String, T212Live> lastGood = new ConcurrentHashMap<>();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public T212LiveService(T212Client client, T212ConnectionService connection, T212Properties properties,
            Clock clock) {
        this.client = client;
        this.connection = connection;
        this.clock = clock;
        Duration ttl = properties.liveCacheTtl();
        this.fresh = Caffeine.newBuilder().expireAfterWrite(ttl).ticker(() -> clock.instant().toEpochMilli() * 1_000_000)
                .build();
    }

    /** Live values, possibly stale; empty when Trading 212 has never answered for this user. */
    public Optional<T212Live> live(String uid) {
        T212Live cached = fresh.getIfPresent(uid);
        if (cached != null) {
            return Optional.of(cached);
        }
        Optional<T212Credentials> credentials = connection.usableCredentials(uid);
        if (credentials.isEmpty()) {
            return Optional.ofNullable(lastGood.get(uid)).map(T212Live::asStale);
        }
        synchronized (lock(uid)) {
            cached = fresh.getIfPresent(uid);
            if (cached != null) {
                return Optional.of(cached);
            }
            try {
                T212Live live = fetch(credentials.get());
                fresh.put(uid, live);
                lastGood.put(uid, live);
                return Optional.of(live);
            } catch (T212Exception e) {
                log.warn("Trading 212 live values of {} unavailable: {}", uid, e.getMessage());
                if (e.kind() == Kind.UNAUTHORIZED || e.kind() == Kind.FORBIDDEN) {
                    connection.markInvalid(uid, T212Errors.message(e));
                }
                return Optional.ofNullable(lastGood.get(uid)).map(T212Live::asStale);
            }
        }
    }

    public void forget(String uid) {
        fresh.invalidate(uid);
        lastGood.remove(uid);
    }

    private Object lock(String uid) {
        return locks.computeIfAbsent(uid, id -> new Object());
    }

    private T212Live fetch(T212Credentials credentials) {
        JsonNode summary = client.accountSummary(credentials);
        Map<String, T212Live.Position> positions = new LinkedHashMap<>();
        for (JsonNode node : client.positions(credentials)) {
            T212Live.Position position = position(node);
            if (position != null) {
                positions.put(position.ticker(), position);
            }
        }
        JsonNode cash = summary.path("cash");
        JsonNode investments = summary.path("investments");
        Double available = Json.number(cash.path("availableToTrade"));
        Double totalCash = available == null ? null : available + zero(Json.number(cash.path("inPies")))
                + zero(Json.number(cash.path("reservedForOrders")));
        T212Live.Account account = new T212Live.Account(Json.text(summary.path("currency")),
                Json.number(summary.path("totalValue")), totalCash, Json.number(investments.path("totalCost")),
                Json.number(investments.path("currentValue")), Json.number(investments.path("unrealizedProfitLoss")),
                Json.number(investments.path("realizedProfitLoss")));
        return new T212Live(account, Map.copyOf(positions), clock.instant(), false);
    }

    static T212Live.Position position(JsonNode node) {
        JsonNode instrument = node.path("instrument");
        String ticker = Json.text(instrument.path("ticker"));
        if (ticker == null) {
            ticker = Json.text(node.path("ticker"));
        }
        Double quantity = Json.number(node.path("quantity"));
        if (ticker == null || quantity == null) {
            return null;
        }
        String currency = Json.text(instrument.path("currency"));
        boolean pence = T212Normalizer.isPence(currency);
        Double average = Json.number(node.path("averagePricePaid"));
        Double current = Json.number(node.path("currentPrice"));
        JsonNode wallet = node.path("walletImpact");
        return new T212Live.Position(ticker, Json.text(instrument.path("name")), Json.text(instrument.path("isin")),
                currency, pence ? "GBP" : currency, quantity,
                pence && average != null ? average / 100 : average, pence && current != null ? current / 100 : current,
                Json.number(wallet.path("currentValue")), Json.number(wallet.path("totalCost")),
                Json.number(wallet.path("unrealizedProfitLoss")), zero(Json.number(node.path("quantityInPies"))));
    }

    private static double zero(Double value) {
        return value == null ? 0 : value;
    }
}
