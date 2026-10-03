package com.earningstracker.t212;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.earningstracker.market.Exchange;
import com.earningstracker.market.Symbols;

/**
 * Trading 212 tickers to the app's canonical symbols: {@code AAPL_US_EQ} → {@code AAPL}, {@code BRK_B_US_EQ} →
 * {@code BRK-B}, {@code SAPd_EQ} → {@code SAP.DE}, {@code AZNl_EQ} → {@code AZN.L}, {@code RBI_AT_EQ} →
 * {@code RBI.VI}, {@code SNDK1_US_EQ} → {@code SNDK}.
 *
 * <p>Checked against a real account's 214 tickers (docs/DATA-SOURCES.md): {@code d} Xetra, {@code l} LSE,
 * {@code p} Paris, {@code a} Amsterdam, {@code m} Milan and {@code s} SIX are seen; {@code e} (Madrid) follows the
 * same convention but was not in that account. A European line can trade in another currency than the exchange's
 * own (LSE and SIX list ETFs in USD and EUR), so only US tickers are checked against their currency. Anything else
 * (Toronto {@code _CA_EQ}, unknown letters) gives null: the instrument still works, just without a stock-detail
 * link.
 */
public final class T212SymbolMapper {

    private static final Pattern US = Pattern.compile("([A-Z0-9][A-Z0-9_]*)_US_EQ");
    /** Trading 212 adds a digit to a reused US ticker: {@code SNDK1_US_EQ} is today's SanDisk, {@code SNDK}. */
    private static final Pattern REUSED = Pattern.compile("^([A-Z]+)\\d$");
    private static final Pattern COUNTRY = Pattern.compile("([A-Z0-9][A-Z0-9_]*)_([A-Z]{2})_EQ");
    private static final Pattern LETTER = Pattern.compile("([A-Z0-9][A-Z0-9_]*?)([a-z])_EQ");
    private static final Map<String, Exchange> LETTERS = Map.of(
            "d", Exchange.XETRA,
            "l", Exchange.LSE,
            "p", Exchange.EURONEXT_PARIS,
            "a", Exchange.EURONEXT_AMSTERDAM,
            "m", Exchange.BORSA_ITALIANA,
            "e", Exchange.BME_MADRID,
            "s", Exchange.SIX);
    private static final Map<String, Exchange> COUNTRIES = Map.of("AT", Exchange.WIENER_BORSE);

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
            String base = REUSED.matcher(us.group(1)).replaceFirst("$1");
            return Symbols.normalize(base.replace('_', '-')).filter(s -> s.indexOf('.') < 0).orElse(null);
        }
        Matcher country = COUNTRY.matcher(t212Ticker);
        if (country.matches()) {
            return european(country.group(1), COUNTRIES.get(country.group(2)));
        }
        Matcher letter = LETTER.matcher(t212Ticker);
        if (letter.matches()) {
            return european(letter.group(1), LETTERS.get(letter.group(2)));
        }
        return null;
    }

    private static String european(String base, Exchange exchange) {
        if (exchange == null) {
            return null;
        }
        return Symbols.normalize(base.replace('_', '-') + "." + exchange.suffix()).orElse(null);
    }
}
