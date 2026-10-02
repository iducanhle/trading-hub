package com.earningstracker.t212;

import java.time.Instant;

/**
 * One paid dividend. {@code amount} is net, in the account currency; {@code grossPerShare} is in
 * {@code grossPerShareCurrency} (pence converted to GBP).
 */
public record T212DividendPayment(String id, Instant paidAt, String ticker, double quantity, double amount,
        Double grossPerShare, String grossPerShareCurrency, String type) {
}
