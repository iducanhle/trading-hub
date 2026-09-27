package com.earningstracker.provider;

public interface FxRateProvider extends MarketDataProvider {

    /** Price of one unit of {@code currency} (ISO 4217, not USD) in USD. */
    double usdPerUnit(String currency);
}
