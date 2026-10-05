package com.earningstracker.provider;

import java.time.LocalDate;
import java.util.NavigableMap;

public interface FxRateProvider extends MarketDataProvider {

    /** Price of one unit of {@code currency} (ISO 4217, not USD) in USD. */
    double usdPerUnit(String currency);

    /** Daily closing prices of one unit of {@code currency} (ISO 4217, not USD) in USD, from {@code from} on. */
    NavigableMap<LocalDate, Double> dailyUsdPerUnit(String currency, LocalDate from);
}
