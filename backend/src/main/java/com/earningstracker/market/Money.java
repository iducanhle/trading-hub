package com.earningstracker.market;

/** LSE prices come in pence ({@code GBp} or {@code GBX}); the API always uses pounds. */
public final class Money {

    private Money() {
    }

    /** Case matters: {@code GBp} is pence, {@code GBP} is pounds. */
    public static boolean isPence(String currency) {
        return "GBp".equals(currency) || "GBX".equals(currency) || "GBx".equals(currency);
    }

    public static String majorCurrency(String currency) {
        return isPence(currency) ? "GBP" : currency;
    }

    public static Double toMajor(Double amount, String currency) {
        // No ternary here: mixing double and Double would unbox a null amount.
        if (amount == null || !isPence(currency)) {
            return amount;
        }
        return amount / 100.0;
    }

    public static double toMajor(double amount, String currency) {
        return isPence(currency) ? amount / 100.0 : amount;
    }
}
