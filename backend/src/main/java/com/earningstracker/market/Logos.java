package com.earningstracker.market;

/**
 * Logo URLs for the API. A stock without a known logo has {@code null}, which the web app shows as the ticker's
 * initials.
 */
public final class Logos {

    /** Ticker-based logos once used as a fallback; they were poor, and copies are still stored in Firestore. */
    private static final String RETIRED_HOST = "financialmodelingprep.com";

    private Logos() {
    }

    /** {@code logoUrl}, or {@code null} when it is blank or comes from the retired fallback. */
    public static String clean(String logoUrl) {
        return logoUrl == null || logoUrl.isBlank() || logoUrl.contains(RETIRED_HOST) ? null : logoUrl;
    }
}
