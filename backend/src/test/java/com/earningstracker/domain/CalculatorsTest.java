package com.earningstracker.domain;

import static com.earningstracker.domain.Bars.on;
import static com.earningstracker.domain.Bars.pct;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.LocalDate;
import java.util.List;

import com.earningstracker.domain.EarningsStatsCalculator.Outcome;
import com.earningstracker.domain.EarningsStatsCalculator.Stats;
import com.earningstracker.domain.EarningsStatsCalculator.Streak;
import com.earningstracker.domain.PerformanceCalculator.Performance;
import com.earningstracker.domain.ReactionCalculator.Reaction;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class CalculatorsTest {

    private static final List<PriceBar> YEAR = Bars.weekdays("2025-09-01", "2026-09-25"); // ends Friday

    @Nested
    class PerformanceSummary {

        @Test
        void comparesTheLastCloseWithEachReference() {
            Performance p = PerformanceCalculator.summary(YEAR, null);
            double last = YEAR.getLast().close();

            assertThat(p.w1()).isCloseTo(pct(last, YEAR.get(YEAR.size() - 6).close()), within(1e-9));
            assertThat(p.m1()).isCloseTo(pct(last, on(YEAR, "2026-08-25").close()), within(1e-9));
            assertThat(p.ytd()).isCloseTo(pct(last, on(YEAR, "2025-12-31").close()), within(1e-9));
            assertThat(p.y1()).isCloseTo(pct(last, on(YEAR, "2025-09-25").close()), within(1e-9));
        }

        @Test
        void usesTheLivePriceWhenNewerThanTheLastBar() {
            // Monday 2026-09-28: the live day counts as the latest trading day.
            Performance p = PerformanceCalculator.summary(YEAR, new LivePrice(LocalDate.of(2026, 9, 28), 500, null));

            assertThat(p.w1()).isCloseTo(pct(500, on(YEAR, "2026-09-21").close()), within(1e-9));
            assertThat(p.m1()).isCloseTo(pct(500, on(YEAR, "2026-08-28").close()), within(1e-9));
            assertThat(p.y1()).isCloseTo(pct(500, on(YEAR, "2025-09-26").close()), within(1e-9)); // on or before
        }

        @Test
        void ignoresALivePriceThatIsNotNewer() {
            Performance withStaleLive = PerformanceCalculator.summary(YEAR,
                    new LivePrice(LocalDate.of(2026, 9, 25), 500, null));

            assertThat(withStaleLive).isEqualTo(PerformanceCalculator.summary(YEAR, null));
        }

        @Test
        void missingHistoryGivesNulls() {
            List<PriceBar> shortHistory = Bars.weekdays("2026-09-21", "2026-09-25");
            Performance p = PerformanceCalculator.summary(shortHistory, null);

            assertThat(p.w1()).isNull(); // needs 5 earlier sessions
            assertThat(p.m1()).isNull();
            assertThat(p.ytd()).isNull();
            assertThat(p.y1()).isNull();
            assertThat(PerformanceCalculator.summary(List.of(), null)).isEqualTo(Performance.EMPTY);
        }
    }

    @Nested
    class EarningsResultAndSurprise {

        @Test
        void comparesEpsRoundedToTwoDecimals() {
            assertThat(EarningsMath.result(1.20, 1.25)).isEqualTo(EarningsResult.BEAT);
            assertThat(EarningsMath.result(1.20, 1.15)).isEqualTo(EarningsResult.MISS);
            assertThat(EarningsMath.result(1.234, 1.2349)).isEqualTo(EarningsResult.INLINE); // both 1.23
            assertThat(EarningsMath.result(1.235, 1.2349)).isEqualTo(EarningsResult.MISS); // 1.24 vs 1.23
            assertThat(EarningsMath.result(null, 1.0)).isNull();
            assertThat(EarningsMath.result(1.0, null)).isNull();
        }

        @Test
        void surpriseUsesTheAbsoluteEstimate() {
            assertThat(EarningsMath.surprisePercent(2.0, 2.5)).isCloseTo(25.0, within(1e-9));
            assertThat(EarningsMath.surprisePercent(-0.5, -0.4)).isCloseTo(20.0, within(1e-9));
            assertThat(EarningsMath.surprisePercent(0.0, 1.0)).isNull();
            assertThat(EarningsMath.surprisePercent(null, 1.0)).isNull();
        }
    }

    @Nested
    class PriceReaction {

        private final List<PriceBar> bars = Bars.weekdays("2026-06-01", "2026-07-31");

        @Test
        void beforeOpenReactsOnTheReportDay() {
            // Wednesday 2026-07-15 BMO: P = Tuesday close, R = Wednesday.
            Reaction r = ReactionCalculator.reaction(bars, LocalDate.of(2026, 7, 15), ReportTime.BMO, Region.US, 5);
            double p = on(bars, "2026-07-14").close();

            assertThat(r.gapPercent()).isCloseTo(pct(on(bars, "2026-07-15").open(), p), within(1e-9));
            assertThat(r.reactionDayPercent()).isCloseTo(pct(on(bars, "2026-07-15").close(), p), within(1e-9));
            assertThat(r.preRunUpPercent()).isCloseTo(pct(p, on(bars, "2026-07-07").close()), within(1e-9));
            assertThat(r.driftPercent()).isCloseTo(pct(on(bars, "2026-07-22").close(), on(bars, "2026-07-15").close()),
                    within(1e-9));
        }

        @Test
        void afterCloseReactsTheNextTradingDay() {
            Reaction r = ReactionCalculator.reaction(bars, LocalDate.of(2026, 7, 15), ReportTime.AMC, Region.US, 5);
            double p = on(bars, "2026-07-15").close();

            assertThat(r.reactionDayPercent()).isCloseTo(pct(on(bars, "2026-07-16").close(), p), within(1e-9));
            assertThat(r.preRunUpPercent()).isCloseTo(pct(p, on(bars, "2026-07-08").close()), within(1e-9));
        }

        @Test
        void duringMarketHoursUsesTheBeforeOpenRule() {
            assertThat(ReactionCalculator.reaction(bars, LocalDate.of(2026, 7, 15), ReportTime.DMH, Region.EU, 5))
                    .isEqualTo(ReactionCalculator.reaction(bars, LocalDate.of(2026, 7, 15), ReportTime.BMO, Region.EU, 5));
        }

        @Test
        void unknownTimeIsAfterCloseInTheUsAndBeforeOpenInEurope() {
            LocalDate d = LocalDate.of(2026, 7, 15);
            assertThat(ReactionCalculator.timeAssumed(ReportTime.UNKNOWN)).isTrue();
            assertThat(ReactionCalculator.reaction(bars, d, ReportTime.UNKNOWN, Region.US, 5))
                    .isEqualTo(ReactionCalculator.reaction(bars, d, ReportTime.AMC, Region.US, 5));
            assertThat(ReactionCalculator.reaction(bars, d, ReportTime.UNKNOWN, Region.EU, 5))
                    .isEqualTo(ReactionCalculator.reaction(bars, d, ReportTime.BMO, Region.EU, 5));
        }

        @Test
        void weekendReportsReactOnTheNextTradingDay() {
            Reaction r = ReactionCalculator.reaction(bars, LocalDate.of(2026, 7, 18), ReportTime.BMO, Region.EU, 5);

            assertThat(r.reactionDayPercent()).isCloseTo(pct(on(bars, "2026-07-20").close(), on(bars, "2026-07-17").close()),
                    within(1e-9));
            assertThat(ReactionCalculator.reactionDay(bars, LocalDate.of(2026, 7, 18), ReportTime.BMO, Region.EU))
                    .isEqualTo(LocalDate.of(2026, 7, 20));
        }

        @Test
        void missingBarsGiveNulls() {
            Reaction lateReport = ReactionCalculator.reaction(bars, LocalDate.of(2026, 7, 29), ReportTime.BMO, Region.US, 5);
            assertThat(lateReport.driftPercent()).isNull(); // fewer than 5 sessions after R
            assertThat(lateReport.reactionDayPercent()).isNotNull();

            assertThat(ReactionCalculator.reaction(bars, LocalDate.of(2026, 7, 31), ReportTime.AMC, Region.US, 5))
                    .isNull(); // reaction day not in the bars yet
            assertThat(ReactionCalculator.reaction(bars, LocalDate.of(2026, 6, 1), ReportTime.BMO, Region.US, 5))
                    .isNull(); // no pre-close before the first bar
        }

        @Test
        void upcomingReactionDayIsTheNextWeekdayByTheSameRule() {
            // Friday 2026-08-07 after close → Monday.
            assertThat(ReactionCalculator.reactionDay(bars, LocalDate.of(2026, 8, 7), ReportTime.AMC, Region.US))
                    .isEqualTo(LocalDate.of(2026, 8, 10));
            assertThat(ReactionCalculator.reactionDay(bars, LocalDate.of(2026, 8, 7), ReportTime.UNKNOWN, Region.EU))
                    .isEqualTo(LocalDate.of(2026, 8, 7));
        }
    }

    @Nested
    class EarningsStats {

        private Outcome beat(double reaction) {
            return new Outcome(EarningsResult.BEAT, reaction);
        }

        @Test
        void computesBeatRateStreakAndAverageAbsoluteReaction() {
            Stats stats = EarningsStatsCalculator.stats(List.of(beat(4), beat(-2), new Outcome(EarningsResult.MISS, -6.0),
                    beat(2)));

            assertThat(stats.quartersAnalyzed()).isEqualTo(4);
            assertThat(stats.beatRate()).isEqualTo(75.0);
            assertThat(stats.streak()).isEqualTo(new Streak(EarningsResult.BEAT, 2));
            assertThat(stats.avgAbsReactionPercent()).isEqualTo(3.5);
        }

        @Test
        void inlineBreaksTheStreak() {
            Stats stats = EarningsStatsCalculator.stats(List.of(new Outcome(EarningsResult.INLINE, 1.0), beat(1)));

            assertThat(stats.streak()).isNull();
            assertThat(stats.beatRate()).isEqualTo(50.0);
        }

        @Test
        void usesAtMostTheEightMostRecentQuartersWithData() {
            List<Outcome> quarters = new java.util.ArrayList<>();
            quarters.add(new Outcome(null, null)); // no data: skipped
            for (int i = 0; i < 8; i++) {
                quarters.add(beat(1));
            }
            quarters.add(new Outcome(EarningsResult.MISS, 50.0)); // ninth: ignored

            Stats stats = EarningsStatsCalculator.stats(quarters);

            assertThat(stats.quartersAnalyzed()).isEqualTo(8);
            assertThat(stats.beatRate()).isEqualTo(100.0);
            assertThat(stats.streak()).isEqualTo(new Streak(EarningsResult.BEAT, 8));
            assertThat(stats.avgAbsReactionPercent()).isEqualTo(1.0);
        }

        @Test
        void noDataGivesEmptyStats() {
            Stats stats = EarningsStatsCalculator.stats(List.of(new Outcome(null, null)));

            assertThat(stats).isEqualTo(new Stats(0, null, null, null));
        }
    }
}
