package com.earningstracker.market;

import java.time.Instant;

/** One intraday bar starting at {@code time}; in the stock's currency (pence normalized). */
public record IntradayBar(Instant time, double open, double high, double low, double close, long volume) {
}
