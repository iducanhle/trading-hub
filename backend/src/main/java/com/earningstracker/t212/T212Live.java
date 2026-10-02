package com.earningstracker.t212;

import java.time.Instant;
import java.util.Map;

/**
 * Live values from Trading 212 (account summary and open positions), as of {@code fetchedAt}.
 * {@code stale} means Trading 212 failed and an older copy is served.
 */
public record T212Live(Account account, Map<String, Position> positions, Instant fetchedAt, boolean stale) {

    /** Account currency amounts; any may be null if Trading 212 left them out. */
    public record Account(String currency, Double totalValue, Double cash, Double invested, Double currentValue,
            Double unrealizedPnl, Double realizedPnl) {
    }

    /**
     * One open position. {@code averagePrice} and {@code currentPrice} are in {@code priceCurrency} (pence
     * converted to GBP); {@code value}, {@code cost} and {@code unrealizedPnl} in the account currency.
     */
    public record Position(String ticker, String name, String isin, String currency, String priceCurrency,
            double quantity, Double averagePrice, Double currentPrice, Double value, Double cost,
            Double unrealizedPnl) {
    }

    public T212Live asStale() {
        return new T212Live(account, positions, fetchedAt, true);
    }
}
