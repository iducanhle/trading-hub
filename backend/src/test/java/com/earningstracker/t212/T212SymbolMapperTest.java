package com.earningstracker.t212;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class T212SymbolMapperTest {

    @ParameterizedTest
    @CsvSource({
            "AAPL_US_EQ, USD, AAPL",
            "BRK_B_US_EQ, USD, BRK-B",
            "NVDA_US_EQ, , NVDA",
            "SAPd_EQ, EUR, SAP.DE",
            "AZNl_EQ, GBX, AZN.L",
            "AZNl_EQ, GBP, AZN.L",
            "MCp_EQ, EUR, MC.PA",
            "ASMLa_EQ, EUR, ASML.AS",
            "NESNz_EQ, CHF, NESN.SW",
            "ENIm_EQ, EUR, ENI.MI",
            "SANe_EQ, EUR, SAN.MC",
            "VOLV_Bs_EQ, SEK, VOLV-B.ST",
    })
    void mapsKnownConventions(String ticker, String currency, String symbol) {
        assertThat(T212SymbolMapper.map(ticker, currency)).isEqualTo(symbol);
    }

    @ParameterizedTest
    @CsvSource({
            "AAPL_US_EQ, EUR",     // a US ticker quoted in EUR is not the NASDAQ listing
            "SAPd_EQ, USD",        // currency does not match Xetra
            "VUSAl_EQ, USD",       // LSE ETF line in USD
            "CEZq_EQ, CZK",        // exchange letter not in the table
            "XYZ_EQ, EUR",         // no exchange letter
            "AAPL, USD",           // not a Trading 212 ticker
    })
    void returnsNullWhenUnsure(String ticker, String currency) {
        assertThat(T212SymbolMapper.map(ticker, currency)).isNull();
    }

    @Test
    void handlesNull() {
        assertThat(T212SymbolMapper.map(null, "USD")).isNull();
    }
}
