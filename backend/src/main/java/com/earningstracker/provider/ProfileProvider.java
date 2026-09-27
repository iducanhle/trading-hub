package com.earningstracker.provider;

import com.earningstracker.market.CompanyProfile;

public interface ProfileProvider extends MarketDataProvider {

    /** Company data plus key stats. */
    CompanyProfile profile(String symbol);
}
