package com.earningstracker.domain;

import static com.earningstracker.domain.Bars.on;
import static com.earningstracker.domain.Bars.pct;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import com.earningstracker.domain.HistoryCalculator.Page;
import com.earningstracker.domain.HistoryCalculator.Period;
import com.earningstracker.domain.HistoryCalculator.Row;
import com.earningstracker.market.PriceBar;
import org.junit.jupiter.api.Test;

class HistoryCalculatorTest {

    // Tue 2026-09-01 .. Tue 2026-09-22.
    private final List<PriceBar> bars = Bars.weekdays("2026-09-01", "2026-09-22");
    private final LocalDate wednesday = LocalDate.of(2026, 9, 23);

    @Test
    void dailyRowsAreNewestFirstWithChangeVsThePreviousClose() {
        List<Row> rows = HistoryCalculator.rows(bars, null, Period.DAILY, Set.of(LocalDate.of(2026, 9, 10)), wednesday);

        assertThat(rows).hasSize(bars.size());
        Row newest = rows.getFirst();
        assertThat(newest.periodStart()).isEqualTo(LocalDate.of(2026, 9, 22));
        assertThat(newest.changePercent()).isCloseTo(pct(on(bars, "2026-09-22").close(), on(bars, "2026-09-21").close()),
                within(1e-9));
        assertThat(rows.getLast().changePercent()).isNull();
        assertThat(rows).filteredOn(Row::hasEarnings).extracting(Row::periodStart).containsExactly(LocalDate.of(2026, 9, 10));
        assertThat(rows).noneMatch(Row::partial);
    }

    @Test
    void theLiveQuoteAddsAPartialDay() {
        List<Row> rows = HistoryCalculator.rows(bars, new LivePrice(wednesday, 200, 5000L), Period.DAILY, Set.of(),
                wednesday);

        Row live = rows.getFirst();
        assertThat(live.periodStart()).isEqualTo(wednesday);
        assertThat(live.close()).isEqualTo(200);
        assertThat(live.volume()).isEqualTo(5000);
        assertThat(live.partial()).isTrue();
        assertThat(live.changePercent()).isCloseTo(pct(200, bars.getLast().close()), within(1e-9));
    }

    @Test
    void weeklyRowsUseIsoWeeksAndMarkTheCurrentWeekPartial() {
        List<Row> rows = HistoryCalculator.rows(bars, new LivePrice(wednesday, 200, 0L), Period.WEEKLY, Set.of(),
                wednesday);

        assertThat(rows).extracting(Row::periodStart).containsExactly(LocalDate.of(2026, 9, 21),
                LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 7), LocalDate.of(2026, 9, 1));
        Row current = rows.getFirst();
        assertThat(current.periodEnd()).isEqualTo(wednesday);
        assertThat(current.close()).isEqualTo(200);
        assertThat(current.partial()).isTrue();
        Row previous = rows.get(1);
        assertThat(previous.close()).isEqualTo(on(bars, "2026-09-18").close());
        assertThat(previous.volume()).isEqualTo(bars.stream().filter(b -> !b.date().isBefore(LocalDate.of(2026, 9, 14))
                && !b.date().isAfter(LocalDate.of(2026, 9, 18))).mapToLong(PriceBar::volume).sum());
        assertThat(previous.partial()).isFalse();
        assertThat(current.changePercent()).isCloseTo(pct(200, previous.close()), within(1e-9));
    }

    @Test
    void aFinishedWeekIsNotPartialOnTheWeekend() {
        List<PriceBar> fullWeek = Bars.weekdays("2026-09-14", "2026-09-25");
        List<Row> rows = HistoryCalculator.rows(fullWeek, null, Period.WEEKLY, Set.of(), LocalDate.of(2026, 9, 26));

        assertThat(rows.getFirst().periodEnd()).isEqualTo(LocalDate.of(2026, 9, 25));
        assertThat(rows.getFirst().partial()).isFalse();
    }

    @Test
    void theCurrentMonthIsPartialUntilItsLastSession() {
        List<Row> rows = HistoryCalculator.rows(Bars.weekdays("2026-08-03", "2026-09-22"), null, Period.MONTHLY, Set.of(),
                wednesday);

        assertThat(rows).extracting(Row::periodStart).containsExactly(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 8, 3));
        assertThat(rows.getFirst().partial()).isTrue();
        assertThat(rows.get(1).partial()).isFalse();
        assertThat(rows.get(1).periodEnd()).isEqualTo(LocalDate.of(2026, 8, 31));
    }

    @Test
    void pagesWithABeforeCursor() {
        List<Row> rows = HistoryCalculator.rows(bars, null, Period.DAILY, Set.of(), wednesday);

        Page first = HistoryCalculator.page(rows, null, 5);
        assertThat(first.rows()).hasSize(5);
        assertThat(first.nextBefore()).isEqualTo(first.rows().getLast().periodStart());

        Page second = HistoryCalculator.page(rows, first.nextBefore(), 5);
        assertThat(second.rows().getFirst().periodStart()).isBefore(first.nextBefore());

        Page last = HistoryCalculator.page(rows, LocalDate.of(2026, 9, 3), 5);
        assertThat(last.rows()).extracting(Row::periodStart).containsExactly(LocalDate.of(2026, 9, 2),
                LocalDate.of(2026, 9, 1));
        assertThat(last.nextBefore()).isNull();
    }
}
