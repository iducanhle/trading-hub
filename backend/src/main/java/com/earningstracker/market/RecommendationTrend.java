package com.earningstracker.market;

import java.time.YearMonth;

/** Analyst recommendation counts for one month. */
public record RecommendationTrend(YearMonth period, int strongBuy, int buy, int hold, int sell, int strongSell) {
}
