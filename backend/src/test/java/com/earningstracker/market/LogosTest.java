package com.earningstracker.market;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LogosTest {

    @Test
    void keepsRealLogosAndDropsBlankOnesAndTheRetiredFallback() {
        assertThat(Logos.clean("https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/AAPL.png"))
                .isEqualTo("https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/AAPL.png");
        assertThat(Logos.clean(null)).isNull();
        assertThat(Logos.clean(" ")).isNull();
        assertThat(Logos.clean("https://financialmodelingprep.com/image-stock/AAPL.png")).isNull();
    }
}
