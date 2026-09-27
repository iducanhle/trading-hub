package com.earningstracker.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import com.earningstracker.domain.EarningsMerger.SourcedReport;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.ReportTime;
import org.junit.jupiter.api.Test;

class EarningsMergerTest {

    private static final List<String> PRIORITY = List.of("finnhub", "fmp", "yahoo");

    private static SourcedReport report(String source, String date, ReportTime time, Integer quarter, Integer year,
            Double epsEstimate, Double epsActual, Double revenueEstimate, Double revenueActual, Boolean confirmed) {
        return new SourcedReport(source, new EarningsReport("AAPL", date == null ? null : LocalDate.parse(date), time,
                null, quarter, year, "USD", epsEstimate, epsActual, revenueEstimate, revenueActual, confirmed));
    }

    private static SourcedReport dateless(String source, String periodEnd, Integer quarter, Integer year, Double actual) {
        return new SourcedReport(source, new EarningsReport("AAPL", null, ReportTime.UNKNOWN, LocalDate.parse(periodEnd),
                quarter, year, "USD", null, actual, null, null, null));
    }

    @Test
    void mergesOneQuarterFromSeveralProvidersInPriorityOrder() {
        List<SourcedReport> merged = EarningsMerger.merge(List.of(
                report("yahoo", "2026-07-31", ReportTime.UNKNOWN, null, null, 1.89, 2.02, null, null, null),
                report("fmp", "2026-07-30", ReportTime.UNKNOWN, null, null, 1.89, 2.02, 109e9, 109.4e9, null),
                report("finnhub", "2026-07-30", ReportTime.AMC, 3, 2026, 1.90, 1.91, null, null, null)), PRIORITY);

        assertThat(merged).hasSize(1);
        EarningsReport q = merged.getFirst().report();
        assertThat(merged.getFirst().source()).isEqualTo("finnhub");
        assertThat(q.date()).isEqualTo(LocalDate.of(2026, 7, 30));
        assertThat(q.time()).isEqualTo(ReportTime.AMC);
        assertThat(q.fiscalQuarter()).isEqualTo(3);
        assertThat(q.epsActual()).isEqualTo(1.91); // Finnhub wins over FMP and Yahoo
        assertThat(q.revenueEstimate()).isEqualTo(109e9); // only FMP has revenue
        assertThat(q.revenueActual()).isEqualTo(109.4e9);
    }

    @Test
    void identifiesTheSameQuarterByFiscalPeriodThenDateThenPeriodEnd() {
        EarningsReport q3 = report("finnhub", "2026-07-30", ReportTime.AMC, 3, 2026, null, null, null, null, null).report();
        assertThat(EarningsMerger.sameQuarter(q3, report("yahoo", "2026-08-03", ReportTime.AMC, 3, 2026, null, null, null, null, null).report())).isTrue();
        assertThat(EarningsMerger.sameQuarter(q3, report("yahoo", "2026-07-31", ReportTime.AMC, 4, 2026, null, null, null, null, null).report())).isFalse();
        assertThat(EarningsMerger.sameQuarter(q3, report("fmp", "2026-08-04", ReportTime.UNKNOWN, null, null, null, null, null, null, null).report())).isTrue();
        assertThat(EarningsMerger.sameQuarter(dateless("a", "2026-06-30", null, null, 1.0).report(), dateless("b", "2026-06-30", null, null, 2.0).report())).isTrue();
    }

    @Test
    void aConfirmedDateWinsOverAnEstimatedOne() {
        List<SourcedReport> merged = EarningsMerger.merge(List.of(
                report("finnhub", "2026-10-28", ReportTime.UNKNOWN, 4, 2026, 2.02, null, null, null, null),
                report("yahoo", "2026-10-29", ReportTime.AMC, 4, 2026, 1.98, null, null, null, true)), PRIORITY);

        assertThat(merged).hasSize(1);
        EarningsReport q = merged.getFirst().report();
        assertThat(q.date()).isEqualTo(LocalDate.of(2026, 10, 29));
        assertThat(q.time()).isEqualTo(ReportTime.AMC);
        assertThat(q.dateConfirmed()).isTrue();
        assertThat(q.epsEstimate()).isEqualTo(2.02);
    }

    @Test
    void differentFiscalQuartersStaySeparateEvenWithCloseDates() {
        List<SourcedReport> merged = EarningsMerger.merge(List.of(
                report("finnhub", "2026-07-30", ReportTime.AMC, 3, 2026, null, 1.0, null, null, null),
                report("yahoo", "2026-08-02", ReportTime.AMC, 4, 2026, null, 2.0, null, null, null)), PRIORITY);

        assertThat(merged).hasSize(2);
    }

    @Test
    void datelessRowsAttachToTheFollowingReportOrAreDropped() {
        List<SourcedReport> merged = EarningsMerger.merge(List.of(
                report("fmp", "2026-07-30", ReportTime.UNKNOWN, null, null, 1.89, null, null, null, null),
                report("fmp", "2026-04-30", ReportTime.UNKNOWN, null, null, 1.95, null, null, null, null),
                dateless("finnhub", "2026-06-30", 3, 2026, 1.91),
                dateless("finnhub", "2024-06-30", 3, 2024, 1.40)), PRIORITY);

        assertThat(merged).extracting(s -> s.report().date())
                .containsExactly(LocalDate.of(2026, 7, 30), LocalDate.of(2026, 4, 30)); // newest first; 2024 row dropped
        EarningsReport q3 = merged.getFirst().report();
        assertThat(q3.fiscalQuarter()).isEqualTo(3);
        assertThat(q3.periodEnd()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(q3.epsActual()).isEqualTo(1.91);
        assertThat(merged.get(1).report().epsActual()).isNull();
    }
}
