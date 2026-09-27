package com.earningstracker.provider;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;

import com.earningstracker.provider.http.ProviderHttpFactory;
import mockwebserver3.Dispatcher;
import mockwebserver3.MockResponse;
import mockwebserver3.RecordedRequest;
import tools.jackson.databind.json.JsonMapper;

/** Fixtures, a fixed clock and fast HTTP settings for provider adapter tests. */
public final class ProviderTestSupport {

    /** Sunday 2026-09-27 10:00 UTC, the day the fixtures were recorded. */
    public static final Instant NOW = Instant.parse("2026-09-27T10:00:00Z");
    public static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);
    public static final JsonMapper JSON = JsonMapper.builder().build();

    private ProviderTestSupport() {
    }

    /** 3 attempts with 1 ms backoff; callers pass a tiny minimum interval. */
    public static ProviderHttpFactory httpFactory(Clock clock) {
        return new ProviderHttpFactory(new ProviderSettings(Map.of(), new ProviderSettings.Http(Duration.ofSeconds(2),
                Duration.ofSeconds(5), 3, Duration.ofMillis(1), Duration.ofSeconds(5))), JSON, clock);
    }

    public static String fixture(String path) {
        try (InputStream in = ProviderTestSupport.class.getResourceAsStream("/fixtures/" + path)) {
            if (in == null) {
                throw new IllegalArgumentException("missing fixture " + path);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public static MockResponse json(String fixturePath) {
        return body(200, fixture(fixturePath));
    }

    public static MockResponse body(int status, String body) {
        return new MockResponse.Builder().code(status).addHeader("Content-Type", "application/json").body(body).build();
    }

    /** Answers by path prefix (longest match wins) and records every request; unknown paths get 404. */
    public static final class Routes extends Dispatcher {

        private final Map<String, Function<RecordedRequest, MockResponse>> routes = new ConcurrentHashMap<>();
        private final List<RecordedRequest> requests = new CopyOnWriteArrayList<>();

        public Routes on(String pathPrefix, MockResponse response) {
            routes.put(pathPrefix, request -> response);
            return this;
        }

        public Routes on(String pathPrefix, Function<RecordedRequest, MockResponse> handler) {
            routes.put(pathPrefix, handler);
            return this;
        }

        @Override
        public MockResponse dispatch(RecordedRequest request) {
            requests.add(request);
            String path = request.getUrl().encodedPath();
            return routes.entrySet().stream()
                    .filter(route -> path.startsWith(route.getKey()))
                    .max((a, b) -> Integer.compare(a.getKey().length(), b.getKey().length()))
                    .map(route -> route.getValue().apply(request))
                    .orElseGet(() -> body(404, "{\"error\":\"no route for " + path + "\"}"));
        }

        public List<RecordedRequest> requests() {
            return requests;
        }

        public List<RecordedRequest> requests(String pathPrefix) {
            return requests.stream().filter(r -> r.getUrl().encodedPath().startsWith(pathPrefix)).toList();
        }
    }
}
