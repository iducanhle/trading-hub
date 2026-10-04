package com.earningstracker.market;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LogosTest {

    private static final String FINNHUB = "https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/AAPL.png";

    @Test
    void keepsTheProvidersLogo() {
        assertThat(Logos.orParqet("AAPL", FINNHUB)).isEqualTo(FINNHUB);
    }

    @Test
    void fallsBackToParqetWhenThereIsNoLogoOrOnlyARetiredOne() {
        String aapl = "https://assets.parqet.com/logos/symbol/AAPL?format=png&size=128";
        assertThat(Logos.orParqet("AAPL", null)).isEqualTo(aapl);
        assertThat(Logos.orParqet("AAPL", " ")).isEqualTo(aapl);
        assertThat(Logos.orParqet("AAPL", "https://financialmodelingprep.com/image-stock/AAPL.png")).isEqualTo(aapl);
        assertThat(Logos.orParqet("AAPL", "https://www.google.com/s2/favicons?domain=apple.com&sz=128"))
                .isEqualTo(aapl);
    }

    @Test
    void writesTickersTheWayParqetExpectsThem() {
        assertThat(Logos.orParqet("BRK.B", null)).contains("/symbol/BRK-B?");
        assertThat(Logos.orParqet("SAP.DE", null)).contains("/symbol/SAP.DE?");
    }

    @Test
    void cleanDropsBlankAndRetiredLogosWithoutAFallback() {
        assertThat(Logos.clean(FINNHUB)).isEqualTo(FINNHUB);
        assertThat(Logos.clean(null)).isNull();
        assertThat(Logos.clean("https://www.google.com/s2/favicons?domain=apple.com&sz=128")).isNull();
    }
}
