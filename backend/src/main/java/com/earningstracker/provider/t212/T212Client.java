package com.earningstracker.provider.t212;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import com.earningstracker.provider.t212.T212Exception.Kind;
import com.earningstracker.t212.T212Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Read-only client for the Trading 212 Public API (findings: docs/DATA-SOURCES.md). It only ever sends GET
 * requests; there are deliberately no methods for placing or cancelling orders.
 *
 * <p>Rate limits are per Trading 212 account and per endpoint. The client tracks the {@code x-ratelimit-*}
 * headers of every response: when nothing is left it waits until the reset, and on a 429 it waits and retries.
 * Waits longer than {@code maxRateLimitWait} fail with {@link Kind#RATE_LIMITED} instead.
 *
 * <p>The {@code Authorization} header is never logged; {@link #describe(HttpRequest)} redacts it.
 */
@Component
public class T212Client {

    /** The three paginated history endpoints. */
    public enum History {
        ORDERS("/api/v0/equity/history/orders"),
        DIVIDENDS("/api/v0/equity/history/dividends"),
        TRANSACTIONS("/api/v0/equity/history/transactions");

        private final String path;

        History(String path) {
            this.path = path;
        }

        public String path() {
            return path;
        }

        public String firstPage(int limit) {
            return path + "?limit=" + limit;
        }
    }

    /** One page of history: the raw items and the path of the next page, or null at the end. */
    public record Page(List<JsonNode> items, String nextPagePath) {
    }

    /** Waits without busy-looping; replaced in tests. */
    @FunctionalInterface
    public interface Sleeper {
        void sleep(Duration duration) throws InterruptedException;
    }

    public static final int MAX_PAGE_SIZE = 50;
    static final String API_PREFIX = "/api/v0/equity/";
    private static final String HISTORY_PREFIX = "/api/v0/equity/history/";
    private static final int MAX_ATTEMPTS = 3;
    private static final Duration DEFAULT_RESET = Duration.ofSeconds(60);
    private static final Logger log = LoggerFactory.getLogger(T212Client.class);

    private final T212Properties properties;
    private final JsonMapper json;
    private final Clock clock;
    private final Sleeper sleeper;
    private final HttpClient http;
    /** Next allowed call per account and endpoint ("accountKey endpointPath"). */
    private final Map<String, Instant> blockedUntil = new ConcurrentHashMap<>();

    @Autowired
    public T212Client(T212Properties properties, JsonMapper json, Clock clock) {
        this(properties, json, clock, duration -> Thread.sleep(duration));
    }

    public T212Client(T212Properties properties, JsonMapper json, Clock clock, Sleeper sleeper) {
        this.properties = properties;
        this.json = json;
        this.clock = clock;
        this.sleeper = sleeper;
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(properties.connectTimeout())
                .followRedirects(HttpClient.Redirect.NEVER) // never resend the Authorization header elsewhere
                .build();
    }

    /** {@code GET /equity/account/summary} (1 per 5 s). */
    public JsonNode accountSummary(T212Credentials credentials) {
        return get(credentials, "/api/v0/equity/account/summary");
    }

    /** {@code GET /equity/positions} (1 per second). */
    public List<JsonNode> positions(T212Credentials credentials) {
        return elements(get(credentials, "/api/v0/equity/positions"), "positions");
    }

    /** {@code GET /equity/metadata/instruments}: every tradable instrument (1 per 50 s). */
    public List<JsonNode> instruments(T212Credentials credentials) {
        return elements(get(credentials, "/api/v0/equity/metadata/instruments"), "instruments");
    }

    /** One history page; {@code path} is {@link History#firstPage(int)} or a previous page's {@code nextPagePath}. */
    public Page historyPage(T212Credentials credentials, String path) {
        if (path == null || !path.startsWith(HISTORY_PREFIX)) {
            throw new T212Exception(Kind.BAD_RESPONSE, "unexpected history path");
        }
        JsonNode body = get(credentials, path);
        List<JsonNode> items = elements(body.path("items"), "history items");
        JsonNode next = body.path("nextPagePath");
        String nextPath = next.isString() && !next.stringValue().isBlank() ? next.stringValue() : null;
        if (nextPath != null && !nextPath.startsWith(HISTORY_PREFIX)) {
            // A path is appended to the configured host; anything else could point the key at another host.
            throw new T212Exception(Kind.BAD_RESPONSE, "unexpected nextPagePath");
        }
        return new Page(items, nextPath);
    }

    /** Request line and headers for logs, with the {@code Authorization} header redacted. */
    public static String describe(HttpRequest request) {
        String headers = request.headers().map().entrySet().stream()
                .map(header -> header.getKey() + "=" + (header.getKey().equalsIgnoreCase("Authorization")
                        ? "[REDACTED]" : String.join(",", header.getValue())))
                .collect(Collectors.joining(", ", "{", "}"));
        return request.method() + " " + request.uri() + " " + headers;
    }

    JsonNode get(T212Credentials credentials, String path) {
        if (!path.startsWith(API_PREFIX)) {
            throw new IllegalArgumentException("not a Trading 212 equity path");
        }
        String limiterKey = accountKey(credentials) + " " + endpoint(path);
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl(credentials.environment()) + path))
                .timeout(properties.readTimeout())
                .header("Authorization", credentials.authorizationHeader())
                .header("Accept", "application/json")
                .GET()
                .build();
        T212Exception last = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            awaitPermit(limiterKey);
            if (log.isDebugEnabled()) {
                log.debug("T212 request {}", describe(request));
            }
            HttpResponse<String> response;
            try {
                response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            } catch (IOException e) {
                last = new T212Exception(Kind.UNAVAILABLE, 0, "I/O error: " + e.getClass().getSimpleName(), null);
                backOff(attempt);
                continue;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new T212Exception(Kind.UNAVAILABLE, "interrupted");
            }
            int status = response.statusCode();
            Instant reset = track(limiterKey, response);
            log.debug("T212 {} {} -> {}", request.method(), endpoint(path), status);
            if (status >= 200 && status < 300) {
                return parse(response.body());
            }
            last = error(status, reset);
            if (last.kind() == Kind.RATE_LIMITED) {
                blockedUntil.put(limiterKey, last.retryAt());
                continue; // awaitPermit waits for the reset, or fails if that is too far away
            }
            if (last.kind() != Kind.UNAVAILABLE) {
                throw last;
            }
            backOff(attempt);
        }
        throw last;
    }

    private String baseUrl(T212Environment environment) {
        return environment == T212Environment.LIVE ? properties.liveUrl() : properties.demoUrl();
    }

    private void awaitPermit(String limiterKey) {
        Instant until = blockedUntil.get(limiterKey);
        if (until == null) {
            return;
        }
        Duration wait = Duration.between(clock.instant(), until);
        if (wait.isNegative() || wait.isZero()) {
            blockedUntil.remove(limiterKey, until);
            return;
        }
        if (wait.compareTo(properties.maxRateLimitWait()) > 0) {
            throw new T212Exception(Kind.RATE_LIMITED, 429, "rate limited until " + until, until);
        }
        log.debug("T212 rate limit: waiting {} ms for {}", wait.toMillis(), limiterKey.substring(
                limiterKey.indexOf(' ') + 1));
        sleep(wait);
        blockedUntil.remove(limiterKey, until);
    }

    /** Remembers when the endpoint frees up again if nothing is left; returns the reset time, if any. */
    private Instant track(String limiterKey, HttpResponse<?> response) {
        OptionalLong remaining = header(response, "x-ratelimit-remaining");
        OptionalLong resetEpoch = header(response, "x-ratelimit-reset");
        Instant reset = resetEpoch.isPresent() ? Instant.ofEpochSecond(resetEpoch.getAsLong()) : null;
        if (reset == null && response.statusCode() == 429) {
            OptionalLong period = header(response, "x-ratelimit-period");
            reset = clock.instant().plus(period.isPresent() ? Duration.ofSeconds(period.getAsLong()) : DEFAULT_RESET);
        }
        if (remaining.isPresent() && remaining.getAsLong() <= 0 && reset != null) {
            blockedUntil.put(limiterKey, reset);
        }
        return reset;
    }

    private static OptionalLong header(HttpResponse<?> response, String name) {
        return response.headers().firstValue(name).map(String::strip).filter(v -> v.matches("\\d+"))
                .map(v -> OptionalLong.of(Long.parseLong(v))).orElse(OptionalLong.empty());
    }

    private T212Exception error(int status, Instant reset) {
        return switch (status) {
            case 401 -> new T212Exception(Kind.UNAUTHORIZED, status, "HTTP 401: the API key was rejected", null);
            case 403 -> new T212Exception(Kind.FORBIDDEN, status, "HTTP 403: the API key lacks a permission", null);
            case 429 -> new T212Exception(Kind.RATE_LIMITED, status, "HTTP 429: rate limited",
                    reset == null ? clock.instant().plus(DEFAULT_RESET) : reset);
            case 408 -> new T212Exception(Kind.UNAVAILABLE, status, "HTTP 408: timed out", null);
            default -> status >= 500
                    ? new T212Exception(Kind.UNAVAILABLE, status, "HTTP " + status, null)
                    : new T212Exception(Kind.BAD_RESPONSE, status, "HTTP " + status, null);
        };
    }

    private void backOff(int attempt) {
        if (attempt < MAX_ATTEMPTS) {
            sleep(Duration.ofSeconds(attempt));
        }
    }

    private void sleep(Duration duration) {
        try {
            sleeper.sleep(duration);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new T212Exception(Kind.UNAVAILABLE, "interrupted");
        }
    }

    private JsonNode parse(String body) {
        if (body == null || body.isBlank()) {
            throw new T212Exception(Kind.BAD_RESPONSE, "empty response");
        }
        try {
            return json.readTree(body);
        } catch (JacksonException e) {
            throw new T212Exception(Kind.BAD_RESPONSE, "response is not JSON");
        }
    }

    private static List<JsonNode> elements(JsonNode node, String what) {
        if (!node.isArray()) {
            throw new T212Exception(Kind.BAD_RESPONSE, what + " is not a list");
        }
        List<JsonNode> result = new ArrayList<>(node.size());
        node.values().forEach(result::add);
        return result;
    }

    private static String endpoint(String path) {
        int query = path.indexOf('?');
        return query < 0 ? path : path.substring(0, query);
    }

    /** Rate limits are per account; keys of one user stand in for the account (hashed, never the key itself). */
    private static String accountKey(T212Credentials credentials) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((credentials.environment() + ":" + credentials.apiKey()).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
