package com.earningstracker.market;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Logo URLs for the API: the provider's logo when there is one (Finnhub), otherwise a square logo for the ticker from
 * Parqet's logo API (free with attribution, see the app menu; 404 for tickers it does not know, which the web app
 * shows as the ticker's initials).
 */
public final class Logos {

    private static final String PARQET = "https://assets.parqet.com/logos/symbol/%s?format=png&size=128";

    /** Earlier fallbacks (ticker images, round favicons); copies are still stored in Firestore. */
    private static final List<String> RETIRED = List.of("financialmodelingprep.com", "google.com/s2/favicons");

    private Logos() {
    }

    /** {@code logoUrl}, unless it is blank or from a retired fallback; then the ticker's Parqet logo. */
    public static String orParqet(String symbol, String logoUrl) {
        String clean = clean(logoUrl);
        return clean != null ? clean : PARQET.formatted(URLEncoder.encode(parqetTicker(symbol), StandardCharsets.UTF_8));
    }

    /** {@code logoUrl}, or {@code null} when it is blank or from a retired fallback. For places that cannot show a broken image (e-mail). */
    public static String clean(String logoUrl) {
        return logoUrl == null || logoUrl.isBlank() || RETIRED.stream().anyMatch(logoUrl::contains) ? null : logoUrl;
    }

    /** Parqet writes US share classes with a dash ({@code BRK-B}); EU tickers keep their exchange suffix. */
    static String parqetTicker(String symbol) {
        return Symbols.euExchange(symbol).isPresent() ? symbol : symbol.replace('.', '-');
    }
}
