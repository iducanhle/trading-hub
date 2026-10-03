package com.earningstracker.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import com.earningstracker.market.Exchange;
import org.junit.jupiter.api.Test;

class ProfileServiceFreshnessTest {

    private static final Instant NOW = Instant.parse("2026-10-03T10:00:00Z");

    private static StockProfile profile(String symbol, Exchange exchange, String currency) {
        return new StockProfile(symbol, symbol, exchange, currency, currency, null, null, null, null, null, null, null,
                null, null, null, null);
    }

    @Test
    void aProfileIsFreshForAWeek() {
        StockProfile aapl = profile("AAPL", Exchange.NASDAQ, "USD");

        assertThat(ProfileService.isFresh(aapl, NOW.minus(Duration.ofDays(6)), NOW)).isTrue();
        assertThat(ProfileService.isFresh(aapl, NOW.minus(Duration.ofDays(8)), NOW)).isFalse();
    }

    @Test
    void aUsProfileInAnotherCurrencyIsLoadedAgain() {
        assertThat(ProfileService.isFresh(profile("SKHY", Exchange.NASDAQ, "KRW"), NOW, NOW)).isFalse();
        assertThat(ProfileService.isFresh(profile("SAP.DE", Exchange.XETRA, "EUR"), NOW, NOW)).isTrue();
    }
}
