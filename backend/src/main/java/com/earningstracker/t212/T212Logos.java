package com.earningstracker.t212;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Predicate;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Trading 212's own instrument icons, from the public bucket its apps use (not part of the official API, so it may
 * change). The bucket answers {@code 403} for tickers without an icon, so a probe decides whether to use the URL;
 * callers fall back to the other logo sources when there is none. Results are cached, failed probes are not.
 */
@Component
public class T212Logos {

    private static final Logger log = LoggerFactory.getLogger(T212Logos.class);
    private static final String URL = "https://trading212equities.s3.eu-central-1.amazonaws.com/%s.png";

    private final Predicate<String> probe;
    private final Cache<String, Boolean> known = Caffeine.newBuilder().maximumSize(5_000)
            .expireAfterWrite(Duration.ofDays(7)).build();

    public T212Logos() {
        this(new HttpProbe());
    }

    /** {@code probe} returns whether the icon URL exists; it throws when that cannot be told. */
    T212Logos(Predicate<String> probe) {
        this.probe = probe;
    }

    /** Icon URLs by T212 ticker, only for tickers that have one. */
    public Map<String, String> urls(Collection<String> tickers) {
        Set<String> unknown = new HashSet<>();
        Map<String, String> urls = new HashMap<>();
        for (String ticker : new HashSet<>(tickers)) {
            Boolean exists = known.getIfPresent(ticker);
            if (exists == null) {
                unknown.add(ticker);
            } else if (exists) {
                urls.put(ticker, url(ticker));
            }
        }
        if (unknown.isEmpty()) {
            return urls;
        }
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            Map<String, Future<Boolean>> probes = new HashMap<>();
            unknown.forEach(ticker -> probes.put(ticker, executor.submit(() -> probe.test(url(ticker)))));
            probes.forEach((ticker, result) -> {
                try {
                    boolean exists = result.get();
                    known.put(ticker, exists);
                    if (exists) {
                        urls.put(ticker, url(ticker));
                    }
                } catch (Exception e) {
                    if (e instanceof InterruptedException) {
                        Thread.currentThread().interrupt();
                    }
                    log.debug("T212 icon probe failed for {}: {}", ticker, e.toString());
                }
            });
        }
        return urls;
    }

    static String url(String ticker) {
        return URL.formatted(URLEncoder.encode(ticker, StandardCharsets.UTF_8));
    }

    private static final class HttpProbe implements Predicate<String> {

        private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

        @Override
        public boolean test(String url) {
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(4))
                        .method("HEAD", HttpRequest.BodyPublishers.noBody()).build();
                int status = http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
                if (status == 200) {
                    return true;
                }
                if (status == 403 || status == 404) {
                    return false;
                }
                throw new IllegalStateException("HTTP " + status);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            } catch (java.io.IOException e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
