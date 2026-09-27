package com.earningstracker.market;

/**
 * Company data and key stats. Prices, market cap and EPS are in {@code currency} (pence normalized to GBP);
 * {@code financialCurrency} is the reporting currency of earnings, which can differ (AZN.L trades in GBP,
 * reports in USD). Any field except symbol, name, exchange and currency can be null.
 */
public record CompanyProfile(
        String symbol,
        String name,
        Exchange exchange,
        String currency,
        String financialCurrency,
        String sector,
        String industry,
        String website,
        String logoUrl,
        String country,
        Double marketCap,
        Double week52High,
        Double week52Low,
        Double peRatio,
        Double epsTtm,
        Long avgVolume) {
}
