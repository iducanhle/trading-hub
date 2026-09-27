package com.earningstracker.provider.yahoo;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Yahoo's unofficial endpoints. Every host is configurable so tests can point them at a mock server.
 *
 * @param cookieUrl      first request of a session; answers 404 but sets the session cookie
 * @param consentUrl     EU consent wall (redirects to the consent form)
 * @param consentPostUrl where the consent form is posted (we always decline)
 * @param copyConsentUrl finishes the consent flow
 * @param minInterval    spacing between calls; we self-limit to at most 1 request per second
 */
@ConfigurationProperties("app.providers.yahoo")
public record YahooProperties(String query1Url, String query2Url, String cookieUrl, String consentUrl,
        String consentPostUrl, String copyConsentUrl, String rssUrl, String userAgent, Duration minInterval) {
}
