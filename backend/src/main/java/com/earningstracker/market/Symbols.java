package com.earningstracker.market;

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Canonical symbols are Yahoo-style and upper case: {@code AAPL}, {@code BRK-B} (US, no suffix) and
 * {@code SAP.DE}, {@code VOLV-B.ST} (Europe, supported exchange suffix). Adapters map to provider formats here.
 */
public final class Symbols {

    private static final Pattern CANONICAL = Pattern.compile("[A-Z0-9]{1,10}(-[A-Z0-9]{1,6})*(\\.[A-Z]{1,2})?");

    private Symbols() {
    }

    /** Upper-cases and validates; empty if the format or the exchange suffix is not supported. */
    public static Optional<String> normalize(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String symbol = raw.strip().toUpperCase(Locale.ROOT);
        if (symbol.length() > 20 || !CANONICAL.matcher(symbol).matches()) {
            return Optional.empty();
        }
        int dot = symbol.indexOf('.');
        if (dot >= 0 && Exchange.bySuffix(symbol.substring(dot + 1)).isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(symbol);
    }

    public static boolean isValid(String symbol) {
        return normalize(symbol).filter(symbol::equals).isPresent();
    }

    /** The European exchange of a canonical symbol, or empty for US symbols. */
    public static Optional<Exchange> euExchange(String symbol) {
        int dot = symbol.indexOf('.');
        return dot < 0 ? Optional.empty() : Exchange.bySuffix(symbol.substring(dot + 1));
    }

    public static Region region(String symbol) {
        return symbol.indexOf('.') < 0 ? Region.US : Region.EU;
    }

    /** Exchange whose timezone and session hours apply to the symbol. */
    public static Exchange sessionExchange(String symbol) {
        return euExchange(symbol).orElse(Exchange.usSession());
    }

    /** US class shares for Finnhub and Twelve Data: {@code BRK-B} → {@code BRK.B}. */
    public static String toDotClass(String usSymbol) {
        return usSymbol.replace('-', '.');
    }

    /** Finnhub / Twelve Data US symbol back to canonical: {@code BRK.B} → {@code BRK-B}. */
    public static String fromDotClass(String providerSymbol) {
        return providerSymbol.toUpperCase(Locale.ROOT).replace('.', '-');
    }
}
