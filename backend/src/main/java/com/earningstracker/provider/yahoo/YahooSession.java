package com.earningstracker.provider.yahoo;

import java.io.IOException;
import java.net.CookieManager;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.http.ProviderHttp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StreamUtils;

/**
 * Cookie + crumb session, as the yfinance library does it. First the direct way (cookie from
 * {@code fc.yahoo.com}, then {@code getcrumb}); if that yields no crumb, the EU consent flow, where we
 * <em>decline</em> consent, which still produces a working session.
 */
final class YahooSession {

    private static final Logger log = LoggerFactory.getLogger(YahooSession.class);
    private static final Pattern CSRF_TOKEN = Pattern.compile("name=\"csrfToken\" value=\"([^\"]+)\"");
    private static final Pattern SESSION_ID = Pattern.compile("name=\"sessionId\" value=\"([^\"]+)\"");

    private final ProviderHttp http;
    private final YahooProperties properties;
    private final CookieManager cookies;
    private volatile String crumb;

    YahooSession(ProviderHttp http, YahooProperties properties, CookieManager cookies) {
        this.http = http;
        this.properties = properties;
        this.cookies = cookies;
    }

    String crumb() {
        String current = crumb;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (crumb == null) {
                crumb = acquire();
            }
            return crumb;
        }
    }

    /** Drops the session if {@code used} is still the current crumb, so the next call starts a new one. */
    synchronized void invalidate(String used) {
        if (Objects.equals(crumb, used)) {
            crumb = null;
            cookies.getCookieStore().removeAll();
        }
    }

    private String acquire() {
        fetch(properties.cookieUrl());
        String direct = fetchCrumb(properties.query1Url());
        if (direct != null) {
            log.info("Yahoo session ready (direct cookie + crumb)");
            return direct;
        }
        log.info("Yahoo returned no crumb; trying the EU consent flow (declining consent)");
        String page = fetch(properties.consentUrl());
        String csrfToken = group(CSRF_TOKEN, page);
        String sessionId = group(SESSION_ID, page);
        if (csrfToken != null && sessionId != null) {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("reject", "reject");
            form.add("consentUUID", "default");
            form.add("sessionId", sessionId);
            form.add("csrfToken", csrfToken);
            form.add("originalDoneUrl", "https://finance.yahoo.com/");
            form.add("namespace", "yahoo");
            http.call(() -> http.client().post().uri(properties.consentPostUrl() + "?sessionId={id}", sessionId)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form)
                    .exchange((request, response) -> response.getStatusCode().value()));
            http.call(() -> http.client().get().uri(properties.copyConsentUrl() + "?sessionId={id}", sessionId)
                    .exchange((request, response) -> response.getStatusCode().value()));
            String consented = fetchCrumb(properties.query2Url());
            if (consented != null) {
                log.info("Yahoo session ready (consent declined)");
                return consented;
            }
        }
        throw new ProviderException(YahooProvider.ID, Kind.UNAVAILABLE, "could not obtain a session crumb", true);
    }

    /** GET that never fails on an HTTP status (the cookie URL answers 404 by design). */
    private String fetch(String url) {
        return http.call(() -> http.client().get().uri(url).exchange((request, response) -> body(response)));
    }

    private String fetchCrumb(String baseUrl) {
        String value = http.call(() -> http.client().get().uri(baseUrl + "/v1/test/getcrumb")
                .exchange((request, response) -> response.getStatusCode().is2xxSuccessful() ? body(response) : null));
        if (value == null) {
            return null;
        }
        String candidate = value.strip();
        return candidate.isEmpty() || candidate.length() > 64 || candidate.contains("<") || candidate.contains(" ")
                ? null
                : candidate;
    }

    private static String body(ClientHttpResponse response) throws IOException {
        return StreamUtils.copyToString(response.getBody(), StandardCharsets.UTF_8);
    }

    private static String group(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text == null ? "" : text);
        return matcher.find() ? matcher.group(1) : null;
    }
}
