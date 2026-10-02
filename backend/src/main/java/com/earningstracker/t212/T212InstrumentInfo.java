package com.earningstracker.t212;

/**
 * What the app knows about an instrument the user traded or held.
 *
 * @param currency Trading 212's instrument currency as sent (e.g. {@code GBX} for LSE pence)
 * @param symbol   the app's canonical symbol, or null when it cannot be mapped safely
 */
public record T212InstrumentInfo(String ticker, String name, String isin, String currency, String symbol) {

    /** The currency prices are reported in after pence normalization. */
    public String priceCurrency() {
        return T212Normalizer.isPence(currency) ? "GBP" : currency;
    }
}
