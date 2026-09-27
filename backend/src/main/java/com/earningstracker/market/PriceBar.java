package com.earningstracker.market;

import java.time.LocalDate;

/** One completed daily session; split-adjusted, in the stock's currency (pence normalized). */
public record PriceBar(LocalDate date, double open, double high, double low, double close, long volume) {
}
