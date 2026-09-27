package com.earningstracker.market;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

class MarketTest {

    @Test
    void normalizesCanonicalSymbols() {
        assertThat(Symbols.normalize(" aapl ")).contains("AAPL");
        assertThat(Symbols.normalize("brk-b")).contains("BRK-B");
        assertThat(Symbols.normalize("sap.de")).contains("SAP.DE");
        assertThat(Symbols.normalize("VOLV-B.ST")).contains("VOLV-B.ST");
        assertThat(Symbols.normalize("NDA-SE.ST")).contains("NDA-SE.ST");
        assertThat(Symbols.normalize("1COV.DE")).contains("1COV.DE");
    }

    @Test
    void rejectsUnsupportedSymbols() {
        assertThat(Symbols.normalize("SAP.F")).isEmpty(); // Frankfurt floor: unsupported suffix
        assertThat(Symbols.normalize("BRK.B")).isEmpty(); // US class shares use a dash
        assertThat(Symbols.normalize("EURUSD=X")).isEmpty();
        assertThat(Symbols.normalize("^GSPC")).isEmpty();
        assertThat(Symbols.normalize("")).isEmpty();
        assertThat(Symbols.normalize(null)).isEmpty();
        assertThat(Symbols.normalize("A".repeat(21))).isEmpty();
    }

    @Test
    void derivesRegionAndExchange() {
        assertThat(Symbols.region("AAPL")).isEqualTo(Region.US);
        assertThat(Symbols.region("AZN.L")).isEqualTo(Region.EU);
        assertThat(Symbols.euExchange("AZN.L")).contains(Exchange.LSE);
        assertThat(Symbols.euExchange("CEZ.PR")).contains(Exchange.PRAGUE);
        assertThat(Symbols.euExchange("AAPL")).isEmpty();
        assertThat(Symbols.sessionExchange("AAPL").zone().getId()).isEqualTo("America/New_York");
    }

    @Test
    void mapsUsShareClassesForDotProviders() {
        assertThat(Symbols.toDotClass("BRK-B")).isEqualTo("BRK.B");
        assertThat(Symbols.fromDotClass("brk.b")).isEqualTo("BRK-B");
        assertThat(Symbols.toDotClass("AAPL")).isEqualTo("AAPL");
    }

    @Test
    void classifiesReportTimesAgainstTheLocalSession() {
        Exchange xetra = Exchange.XETRA;
        assertThat(xetra.classify(Instant.parse("2026-01-29T05:21:28Z"))).isEqualTo(ReportTime.BMO); // 06:21 CET
        assertThat(xetra.classify(Instant.parse("2026-04-23T12:00:00Z"))).isEqualTo(ReportTime.DMH); // 14:00 CEST
        assertThat(xetra.classify(Instant.parse("2026-04-23T20:05:00Z"))).isEqualTo(ReportTime.AMC); // 22:05 CEST
        assertThat(xetra.classify(Instant.parse("2026-07-23T00:00:00Z"))).isEqualTo(ReportTime.UNKNOWN); // date only
        assertThat(Exchange.NASDAQ.classify(Instant.parse("2026-07-30T20:30:28Z"))).isEqualTo(ReportTime.AMC);
        assertThat(Exchange.NASDAQ.localDate(Instant.parse("2026-07-31T02:00:00Z"))).isEqualTo(LocalDate.of(2026, 7, 30));
    }

    @Test
    void normalizesPenceToPounds() {
        assertThat(Money.isPence("GBp")).isTrue();
        assertThat(Money.isPence("GBX")).isTrue();
        assertThat(Money.isPence("GBP")).isFalse();
        assertThat(Money.toMajor(12552.0, "GBp")).isEqualTo(125.52);
        assertThat(Money.toMajor(12552.0, "GBP")).isEqualTo(12552.0);
        assertThat(Money.toMajor((Double) null, "GBp")).isNull();
        assertThat(Money.toMajor((Double) null, "EUR")).isNull();
        assertThat(Money.majorCurrency("GBp")).isEqualTo("GBP");
        assertThat(Money.majorCurrency("EUR")).isEqualTo("EUR");
    }

    @Test
    void dropsTodaysBarUntilTheSessionHasSettled() {
        List<PriceBar> bars = List.of(bar("2026-09-24"), bar("2026-09-25"));
        Exchange us = Exchange.usSession();
        // Friday 2026-09-25 15:00 ET: session still running.
        assertThat(PriceBars.completedSessions(bars, us, Instant.parse("2026-09-25T19:00:00Z"))).hasSize(1);
        // Friday 16:45 ET: settled.
        assertThat(PriceBars.completedSessions(bars, us, Instant.parse("2026-09-25T20:45:00Z"))).hasSize(2);
        // Saturday: last bar is from a past session.
        assertThat(PriceBars.completedSessions(bars, us, Instant.parse("2026-09-26T12:00:00Z"))).hasSize(2);
    }

    private static PriceBar bar(String date) {
        return new PriceBar(LocalDate.parse(date), 1, 1, 1, 1, 1);
    }
}
