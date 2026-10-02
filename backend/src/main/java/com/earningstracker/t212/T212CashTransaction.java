package com.earningstracker.t212;

import java.time.Instant;

/**
 * A deposit, withdrawal, fee, transfer or interest payment. {@code amount} is signed (negative = money out) and in
 * {@code currency}, which need not be the account currency.
 */
public record T212CashTransaction(String id, Instant at, String type, double amount, String currency) {
}
