package com.earningstracker.t212;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.t212.T212Client;
import com.earningstracker.provider.t212.T212Credentials;
import com.earningstracker.provider.t212.T212Exception;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * The user's pies: name, value and result of each, and of each instrument inside. Trading 212 marks these
 * endpoints deprecated and limits them hard (list 1 per 30 s, detail 1 per 5 s), so a copy is reused per user for
 * {@link #TTL}. When they fail (no {@code pies:read} permission, or the endpoints are gone) the last good copy is
 * served; with none, the caller falls back to the positions' {@code quantityInPies}. A failure here never marks the
 * key invalid: the rest of the portfolio does not need pies.
 */
@Service
public class T212PieService {

    static final Duration TTL = Duration.ofMinutes(5);
    private static final Logger log = LoggerFactory.getLogger(T212PieService.class);

    /** Amounts in the account currency; any may be null if Trading 212 left them out. */
    public record Result(Double value, Double invested, Double pnl, Double pnlCoef) {
    }

    public record Item(String ticker, double ownedQuantity, Result result) {
    }

    public record Pie(long id, String name, Result result, List<Item> items) {
    }

    private final T212Client client;
    private final T212ConnectionService connection;
    private final Cache<String, List<Pie>> fresh;
    private final Map<String, List<Pie>> lastGood = new ConcurrentHashMap<>();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public T212PieService(T212Client client, T212ConnectionService connection, Clock clock) {
        this.client = client;
        this.connection = connection;
        this.fresh = Caffeine.newBuilder().expireAfterWrite(TTL)
                .ticker(() -> clock.instant().toEpochMilli() * 1_000_000).build();
    }

    /** The pies, possibly from an older fetch; empty when Trading 212 has never answered for this user. */
    public Optional<List<Pie>> pies(String uid) {
        List<Pie> cached = fresh.getIfPresent(uid);
        if (cached != null) {
            return Optional.of(cached);
        }
        Optional<T212Credentials> credentials = connection.usableCredentials(uid);
        if (credentials.isEmpty()) {
            return Optional.ofNullable(lastGood.get(uid));
        }
        synchronized (locks.computeIfAbsent(uid, id -> new Object())) {
            cached = fresh.getIfPresent(uid);
            if (cached != null) {
                return Optional.of(cached);
            }
            try {
                List<Pie> pies = fetch(credentials.get());
                fresh.put(uid, pies);
                lastGood.put(uid, pies);
                return Optional.of(pies);
            } catch (T212Exception e) {
                log.warn("Trading 212 pies of {} unavailable: {}", uid, e.getMessage());
                return Optional.ofNullable(lastGood.get(uid));
            }
        }
    }

    public void forget(String uid) {
        fresh.invalidate(uid);
        lastGood.remove(uid);
    }

    private List<Pie> fetch(T212Credentials credentials) {
        List<Pie> pies = new ArrayList<>();
        for (JsonNode node : client.pies(credentials)) {
            Long id = Json.longNumber(node.path("id"));
            if (id == null) {
                continue;
            }
            JsonNode detail = client.pie(credentials, id);
            List<Item> items = new ArrayList<>();
            for (JsonNode instrument : detail.path("instruments").values()) {
                String ticker = Json.text(instrument.path("ticker"));
                Double owned = Json.number(instrument.path("ownedQuantity"));
                if (ticker != null && owned != null && owned > 0) {
                    items.add(new Item(ticker, owned, result(instrument.path("result"))));
                }
            }
            pies.add(new Pie(id, Json.text(detail.path("settings").path("name")), result(node.path("result")),
                    List.copyOf(items)));
        }
        return List.copyOf(pies);
    }

    private static Result result(JsonNode node) {
        return new Result(Json.number(node.path("priceAvgValue")), Json.number(node.path("priceAvgInvestedValue")),
                Json.number(node.path("priceAvgResult")), Json.number(node.path("priceAvgResultCoef")));
    }
}
