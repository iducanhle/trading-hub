package com.earningstracker.t212;

import java.time.Instant;

/**
 * One filled order (a trade or a corporate-action fill), normalized: quantity and value are always positive and
 * {@code side} says the direction; money is in {@code currency} (the account currency unless the trade settled in
 * another currency of a multi-currency account), {@code price} in {@code priceCurrency} (LSE pence converted to
 * GBP).
 *
 * @param id          {@code order.id} + "-" + {@code fill.id}
 * @param kind        TRADE, STOCK_SPLIT or CORPORATE_ACTION
 * @param fillType    Trading 212's {@code fill.type} as sent
 * @param value       |{@code walletImpact.netValue}|, in {@code currency}
 * @param fees        commissions, FX, FINRA and transaction fees, in {@code currency}
 * @param taxes       stamp duty, SDRT and the French transaction tax, in {@code currency}
 * @param realizedPnl Trading 212's realized result, SELL only, before fees and taxes; null when absent
 * @param currency    {@code walletImpact.currency} when it is not the account currency; null means the account
 *                    currency
 */
public record T212Fill(String id, String orderId, Instant executedAt, String ticker, Side side, String kind,
        String fillType, double quantity, Double price, String priceCurrency, double value, double fees, double taxes,
        Double fxRate, Double realizedPnl, String orderType, String currency) {

    public enum Side {
        BUY, SELL
    }

    public static final String TRADE = "TRADE";
    public static final String STOCK_SPLIT = "STOCK_SPLIT";
    public static final String CORPORATE_ACTION = "CORPORATE_ACTION";

    /** A fill in the account currency. */
    public T212Fill(String id, String orderId, Instant executedAt, String ticker, Side side, String kind,
            String fillType, double quantity, Double price, String priceCurrency, double value, double fees,
            double taxes, Double fxRate, Double realizedPnl, String orderType) {
        this(id, orderId, executedAt, ticker, side, kind, fillType, quantity, price, priceCurrency, value, fees, taxes,
                fxRate, realizedPnl, orderType, null);
    }

    /** The same fill with its money multiplied by {@code rate} and expressed in the account currency. */
    T212Fill converted(double rate) {
        return new T212Fill(id, orderId, executedAt, ticker, side, kind, fillType, quantity, price, priceCurrency,
                value * rate, fees * rate, taxes * rate, fxRate, realizedPnl == null ? null : realizedPnl * rate,
                orderType, null);
    }
}
