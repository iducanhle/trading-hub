package com.earningstracker.t212;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Instant;
import java.util.List;

import com.earningstracker.t212.T212RateOfReturn.Flow;
import org.junit.jupiter.api.Test;

class T212RateOfReturnTest {

    private static final Instant START = Instant.parse("2025-01-01T00:00:00Z");
    private static final Instant MIDDLE = Instant.parse("2025-07-02T12:00:00Z");
    private static final Instant END = Instant.parse("2026-01-01T00:00:00Z");

    @Test
    void oneDepositIsTheSimpleReturn() {
        assertThat(T212RateOfReturn.compute(List.of(new Flow(START, 1000)), 1100, END)).isCloseTo(0.10, within(1e-9));
    }

    @Test
    void aLateDepositWeighsLessThanAnEarlyOne() {
        // 1,000 for the whole year and 1,000 for half of it: the 100 gained is about 100 ÷ 1,500 of the money.
        Double rate = T212RateOfReturn.compute(List.of(new Flow(START, 1000), new Flow(MIDDLE, 1000)), 2100, END);

        assertThat(rate).isCloseTo(0.0670, within(1e-4));
        assertThat(rate).isGreaterThan(100.0 / 2000);
    }

    @Test
    void withdrawalsCount() {
        Double rate = T212RateOfReturn.compute(List.of(new Flow(START, 1000), new Flow(MIDDLE, -500)), 600, END);

        assertThat(rate).isCloseTo(0.1320, within(1e-4));
    }

    @Test
    void nullWithoutDepositsOrValue() {
        assertThat(T212RateOfReturn.compute(List.of(), 1000, END)).isNull();
        assertThat(T212RateOfReturn.compute(List.of(new Flow(START, 1000)), 0, END)).isNull();
        assertThat(T212RateOfReturn.compute(List.of(new Flow(END, 1000)), 1000, END)).isNull();
    }

    @Test
    void aLossIsNegative() {
        assertThat(T212RateOfReturn.compute(List.of(new Flow(START, 1000)), 800, END)).isCloseTo(-0.20, within(1e-9));
    }
}
