package com.earningstracker.market;

import java.time.Instant;

/**
 * Latest price in the stock's currency (pence normalized); {@code changePercent} in percent units. {@code volume}
 * is today's volume when the source has it (Yahoo does, Finnhub's quote does not).
 */
public record Quote(String symbol, double price, double change, double changePercent, double previousClose,
        String currency, Instant asOf, Long volume) {

    public static Quote of(String symbol, double price, double previousClose, String currency, Instant asOf) {
        return of(symbol, price, previousClose, currency, asOf, null);
    }

    public static Quote of(String symbol, double price, double previousClose, String currency, Instant asOf,
            Long volume) {
        double change = price - previousClose;
        double changePercent = previousClose == 0 ? 0 : change / previousClose * 100;
        return new Quote(symbol, price, change, changePercent, previousClose, currency, asOf, volume);
    }
}
