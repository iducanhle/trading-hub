package com.earningstracker.t212;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.earningstracker.market.Exchange;
import com.earningstracker.market.Symbols;

/**
 * Trading 212 tickers to the app's canonical symbols: {@code AAPL_US_EQ} → {@code AAPL}, {@code BRK_B_US_EQ} →
 * {@code BRK-B}, {@code SAPd_EQ} → {@code SAP.DE}, {@code AZNl_EQ} → {@code AZN.L}.
 *
 * <p>The suffix letters follow the convention seen in public Trading 212 integrations (UNVERIFIED, see
 * docs/DATA-SOURCES.md). A mapping is returned only when the instrument's currency matches the exchange's, so an
 * uncertain case gives null (the instrument still works, just without a stock-detail link) rather than a wrong
 * stock.
 */
public final class T212SymbolMapper {

    private static final Pattern US = Pattern.compile("([A-Z0-9][A-Z0-9_]*)_US_EQ");
    private static final Pattern EUROPE = Pattern.compile("([A-Z0-9][A-Z0-9_]*?)([a-z])_EQ");
    private static final Map<String, Exchange> EXCHANGES = Map.of(
            "d", Exchange.XETRA,
            "l", Exchange.LSE,
            "p", Exchange.EURONEXT_PARIS,
            "a", Exchange.EURONEXT_AMSTERDAM,
            "z", Exchange.SIX,
            "m", Exchange.BORSA_ITALIANA,
            "e", Exchange.BME_MADRID,
            "s", Exchange.NASDAQ_STOCKHOLM);

    private T212SymbolMapper() {
    }

    /**
     * @param currency the instrument currency as Trading 212 reports it ({@code GBX} for pence), or null if unknown
     * @return the canonical symbol, or null
     */
    public static String map(String t212Ticker, String currency) {
        if (t212Ticker == null) {
            return null;
        }
        Matcher us = US.matcher(t212Ticker);
        if (us.matches()) {
            if (currency != null && !"USD".equalsIgnoreCase(currency)) {
                return null;
            }
            return Symbols.normalize(us.group(1).replace('_', '-')).filter(s -> s.indexOf('.') < 0).orElse(null);
        }
        Matcher europe = EUROPE.matcher(t212Ticker);
        if (europe.matches()) {
            Exchange exchange = EXCHANGES.get(europe.group(2));
            if (exchange == null) {
                return null;
            }
            String normalizedCurrency = T212Normalizer.isPence(currency) ? "GBP" : currency;
            if (normalizedCurrency != null && !exchange.currency().equalsIgnoreCase(normalizedCurrency)) {
                return null;
            }
            return Symbols.normalize(europe.group(1).replace('_', '-') + "." + exchange.suffix()).orElse(null);
        }
        return null;
    }
}
