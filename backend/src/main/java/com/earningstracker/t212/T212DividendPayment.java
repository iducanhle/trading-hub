package com.earningstracker.t212;

import java.time.Instant;

/**
 * One paid dividend. {@code amount} is net, in {@code currency} (null means the account currency);
 * {@code grossPerShare} is in {@code grossPerShareCurrency} (pence converted to GBP).
 */
public record T212DividendPayment(String id, Instant paidAt, String ticker, double quantity, double amount,
        Double grossPerShare, String grossPerShareCurrency, String type, String currency) {

    /** A dividend paid in the account currency. */
    public T212DividendPayment(String id, Instant paidAt, String ticker, double quantity, double amount,
            Double grossPerShare, String grossPerShareCurrency, String type) {
        this(id, paidAt, ticker, quantity, amount, grossPerShare, grossPerShareCurrency, type, null);
    }

    /** The same dividend with its amount multiplied by {@code rate} and expressed in the account currency. */
    T212DividendPayment converted(double rate) {
        return new T212DividendPayment(id, paidAt, ticker, quantity, amount * rate, grossPerShare,
                grossPerShareCurrency, type, null);
    }
}
