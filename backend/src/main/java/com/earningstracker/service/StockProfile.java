package com.earningstracker.service;

import com.earningstracker.market.Exchange;

/**
 * What {@code symbols/{symbol}} holds: company data, key stats, {@code marketCapUsd} and the final logo URL.
 * Money is in {@code currency} (pence normalized); {@code financialCurrency} is the reporting currency.
 */
public record StockProfile(
        String symbol,
        String name,
        Exchange exchange,
        String currency,
        String financialCurrency,
        String sector,
        String industry,
        String website,
        String logoUrl,
        Double marketCap,
        Double marketCapUsd,
        Double week52High,
        Double week52Low,
        Double peRatio,
        Double epsTtm,
        Long avgVolume) {
}
