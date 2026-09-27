package com.earningstracker.provider.http;

import java.net.CookieHandler;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.util.function.Consumer;

import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderSettings;
import io.github.resilience4j.core.IntervalFunction;
import io.github.resilience4j.ratelimiter.RateLimiter;
import io.github.resilience4j.ratelimiter.RateLimiterConfig;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

/** Builds {@link ProviderHttp} instances that share timeouts and retry settings. */
@Component
public class ProviderHttpFactory {

    private final ProviderSettings.Http settings;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public ProviderHttpFactory(ProviderSettings settings, JsonMapper jsonMapper, Clock clock) {
        this.settings = settings.http();
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    /**
     * @param minInterval  minimum spacing between calls, e.g. 1 s for Yahoo (smooth, never bursty)
     * @param dailyLimit   calls per UTC day, or 0 for no daily limit
     * @param cookies      cookie store for session-based providers (Yahoo), or null
     * @param statusMapper how HTTP errors map to failure kinds, or null for the defaults
     */
    public ProviderHttp create(String provider, String baseUrl, Duration minInterval, int dailyLimit,
            CookieHandler cookies, ProviderHttp.StatusMapper statusMapper, Consumer<RestClient.Builder> customizer) {
        HttpClient.Builder httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(settings.connectTimeout())
                .followRedirects(HttpClient.Redirect.NORMAL);
        if (cookies != null) {
            httpClient.cookieHandler(cookies);
        }
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient.build());
        requestFactory.setReadTimeout(settings.readTimeout());
        RestClient.Builder builder = RestClient.builder().requestFactory(requestFactory).baseUrl(baseUrl);
        customizer.accept(builder);

        RateLimiter rateLimiter = RateLimiter.of(provider, RateLimiterConfig.custom()
                .limitForPeriod(1)
                .limitRefreshPeriod(minInterval)
                .timeoutDuration(settings.permitTimeout())
                .build());
        Retry retry = Retry.of(provider, RetryConfig.custom()
                .maxAttempts(settings.maxAttempts())
                .intervalFunction(IntervalFunction.ofExponentialRandomBackoff(settings.initialBackoff(), 2.0, 0.5))
                .retryOnException(e -> e instanceof ProviderException pe && pe.isRetryable())
                .build());
        DailyQuota quota = dailyLimit > 0 ? new DailyQuota(dailyLimit, clock) : null;
        return new ProviderHttp(provider, builder.build(), rateLimiter, retry, quota, jsonMapper,
                statusMapper == null ? ProviderHttp.DEFAULT_STATUS_MAPPER : statusMapper);
    }
}
