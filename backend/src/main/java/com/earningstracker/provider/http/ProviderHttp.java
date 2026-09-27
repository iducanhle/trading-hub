package com.earningstracker.provider.http;

import java.util.function.Supplier;

import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.retry.Retry;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * HTTP access for one provider: every attempt takes a rate-limit permit (and a daily-quota unit), transient
 * failures are retried with exponential backoff and jitter, and errors become {@link ProviderException}s whose
 * messages contain no URLs or keys.
 */
public final class ProviderHttp {

    /** Maps an HTTP error status (and body) to a failure kind; providers override the defaults where needed. */
    @FunctionalInterface
    public interface StatusMapper {
        Kind kind(int status, String body);
    }

    public static final StatusMapper DEFAULT_STATUS_MAPPER = (status, body) -> {
        if (status == 404) {
            return Kind.NOT_FOUND;
        }
        if (status == 401 || status == 402 || status == 403) {
            return Kind.UNSUPPORTED;
        }
        if (status == 429) {
            return Kind.RATE_LIMITED;
        }
        return status >= 500 ? Kind.UNAVAILABLE : Kind.BAD_RESPONSE;
    };

    private final String provider;
    private final RestClient client;
    private final RateLimiter rateLimiter;
    private final Retry retry;
    private final DailyQuota quota;
    private final JsonMapper jsonMapper;
    private final StatusMapper statusMapper;

    ProviderHttp(String provider, RestClient client, RateLimiter rateLimiter, Retry retry, DailyQuota quota,
            JsonMapper jsonMapper, StatusMapper statusMapper) {
        this.provider = provider;
        this.client = client;
        this.rateLimiter = rateLimiter;
        this.retry = retry;
        this.quota = quota;
        this.jsonMapper = jsonMapper;
        this.statusMapper = statusMapper;
    }

    public RestClient client() {
        return client;
    }

    public JsonNode getJson(String uriTemplate, Object... uriVariables) {
        return parse(getText(uriTemplate, uriVariables));
    }

    public String getText(String uriTemplate, Object... uriVariables) {
        return call(() -> client.get().uri(uriTemplate, uriVariables).retrieve().body(String.class));
    }

    public JsonNode parse(String body) {
        if (body == null || body.isBlank()) {
            throw new ProviderException(provider, Kind.BAD_RESPONSE, "empty response");
        }
        try {
            return jsonMapper.readTree(body);
        } catch (JacksonException e) {
            throw new ProviderException(provider, Kind.BAD_RESPONSE, "response is not JSON");
        }
    }

    /** Runs one request with rate limiting, quota, retries and error mapping. */
    public <T> T call(Supplier<T> request) {
        return Retry.decorateSupplier(retry, () -> {
            acquirePermit();
            try {
                return request.get();
            } catch (RestClientResponseException e) {
                throw error(e.getStatusCode().value(), e.getResponseBodyAsString());
            } catch (ResourceAccessException e) {
                throw new ProviderException(provider, Kind.UNAVAILABLE, "I/O error: " + rootCause(e), true);
            }
        }).get();
    }

    public ProviderException error(int status, String body) {
        Kind kind = statusMapper.kind(status, body == null ? "" : body);
        String snippet = body == null ? "" : body.replaceAll("\\s+", " ").strip();
        if (snippet.length() > 160) {
            snippet = snippet.substring(0, 160) + "…";
        }
        return new ProviderException(provider, kind, "HTTP " + status + (snippet.isEmpty() ? "" : ": " + snippet),
                kind == Kind.RATE_LIMITED || kind == Kind.UNAVAILABLE);
    }

    private void acquirePermit() {
        if (quota != null && !quota.tryAcquire()) {
            throw new ProviderException(provider, Kind.RATE_LIMITED,
                    "daily quota of " + quota.limit() + " calls used up");
        }
        if (!rateLimiter.acquirePermission()) {
            throw new ProviderException(provider, Kind.RATE_LIMITED, "timed out waiting for a rate-limit permit");
        }
    }

    private static String rootCause(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName() + (root.getMessage() == null ? "" : " " + root.getMessage());
    }
}
