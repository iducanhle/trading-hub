package com.earningstracker.t212;

import java.time.Instant;

/**
 * One filled order (a trade or a corporate-action fill), normalized: quantity and value are always positive and
 * {@code side} says the direction; money is in the account currency, {@code price} in {@code priceCurrency}
 * (LSE pence converted to GBP).
 *
 * @param id          {@code order.id} + "-" + {@code fill.id}
 * @param kind        TRADE, STOCK_SPLIT or CORPORATE_ACTION
 * @param fillType    Trading 212's {@code fill.type} as sent
 * @param value       |{@code walletImpact.netValue}|, account currency
 * @param fees        commissions, FX, FINRA and transaction fees, account currency
 * @param taxes       stamp duty, SDRT and the French transaction tax, account currency
 * @param realizedPnl Trading 212's realized result, SELL only, before fees and taxes; null when absent
 */
public record T212Fill(String id, String orderId, Instant executedAt, String ticker, Side side, String kind,
        String fillType, double quantity, Double price, String priceCurrency, double value, double fees, double taxes,
        Double fxRate, Double realizedPnl, String orderType) {

    public enum Side {
        BUY, SELL
    }

    public static final String TRADE = "TRADE";
    public static final String STOCK_SPLIT = "STOCK_SPLIT";
    public static final String CORPORATE_ACTION = "CORPORATE_ACTION";
}
