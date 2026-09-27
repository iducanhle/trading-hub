package com.earningstracker.provider;

import com.earningstracker.market.CompanyProfile;

public interface ProfileProvider extends MarketDataProvider {

    /** Company data plus key stats. */
    CompanyProfile profile(String symbol);

    /**
     * Name, exchange, currency, market cap and logo at the lowest cost (the calendar job enriches hundreds of
     * symbols); key stats may be missing. Defaults to the full profile.
     */
    default CompanyProfile basics(String symbol) {
        return profile(symbol);
    }
}
