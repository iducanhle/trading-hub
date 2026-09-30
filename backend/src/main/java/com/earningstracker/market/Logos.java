package com.earningstracker.market;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Logo URLs for the API. Without a known logo, a ticker-based one from Financial Modeling Prep's public image endpoint
 * (no API key; it covers most US and many EU tickers, and answers 404 for the rest, which the web app shows as the
 * ticker's initials).
 */
public final class Logos {

    static final String FALLBACK = "https://financialmodelingprep.com/image-stock/%s.png";

    private Logos() {
    }

    /** {@code logoUrl} when there is one, otherwise the ticker-based fallback. */
    public static String orFallback(String symbol, String logoUrl) {
        return logoUrl != null && !logoUrl.isBlank() ? logoUrl : fallback(symbol);
    }

    public static String fallback(String symbol) {
        return FALLBACK.formatted(URLEncoder.encode(symbol, StandardCharsets.UTF_8));
    }
}
