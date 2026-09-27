package com.earningstracker.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import com.earningstracker.market.PriceBar;

/**
 * Performance history (§5). DAILY: one row per trading day. WEEKLY (ISO weeks) and MONTHLY (calendar months): the
 * period's last close vs the previous period's last close, volume summed. The current, unfinished period uses the
 * live price and is marked {@code partial}. Rows are newest first.
 */
public final class HistoryCalculator {

    public enum Period {
        DAILY, WEEKLY, MONTHLY
    }

    public record Row(LocalDate periodStart, LocalDate periodEnd, double close, Double changePercent, long volume,
            boolean hasEarnings, boolean partial) {
    }

    public record Page(List<Row> rows, LocalDate nextBefore) {
    }

    private record Point(LocalDate date, double close, long volume, boolean live) {
    }

    private HistoryCalculator() {
    }

    /**
     * @param bars         completed sessions, oldest first
     * @param live         latest quote (used when newer than the last bar), or null
     * @param reactionDays earnings reaction days, flagged with {@code hasEarnings}
     * @param today        today in the exchange's local time
     */
    public static List<Row> rows(List<PriceBar> bars, LivePrice live, Period period, Set<LocalDate> reactionDays,
            LocalDate today) {
        List<Point> points = new ArrayList<>(bars.size() + 1);
        bars.forEach(bar -> points.add(new Point(bar.date(), bar.close(), bar.volume(), false)));
        if (live != null && (bars.isEmpty() || live.date().isAfter(bars.getLast().date()))) {
            points.add(new Point(live.date(), live.price(), Objects.requireNonNullElse(live.volume(), 0L), true));
        }
        LocalDate lastBarDate = bars.isEmpty() ? null : bars.getLast().date();

        List<Row> rows = new ArrayList<>();
        Double previousClose = null;
        int start = 0;
        while (start < points.size()) {
            int end = start;
            while (end + 1 < points.size() && samePeriod(period, points.get(start).date(), points.get(end + 1).date())) {
                end++;
            }
            List<Point> group = points.subList(start, end + 1);
            Point last = group.getLast();
            boolean hasLive = group.stream().anyMatch(Point::live);
            boolean partial = hasLive || (period != Period.DAILY && end == points.size() - 1
                    && unfinished(period, last.date(), today, lastBarDate));
            rows.add(new Row(group.getFirst().date(), last.date(), last.close(),
                    previousClose == null ? null : Percent.change(last.close(), previousClose),
                    group.stream().mapToLong(Point::volume).sum(),
                    group.stream().anyMatch(p -> reactionDays.contains(p.date())), partial));
            previousClose = last.close();
            start = end + 1;
        }
        Collections.reverse(rows);
        return rows;
    }

    /** Rows with {@code periodStart} before {@code before} (all when null), at most {@code limit}. */
    public static Page page(List<Row> newestFirst, LocalDate before, int limit) {
        List<Row> eligible = before == null ? newestFirst
                : newestFirst.stream().filter(row -> row.periodStart().isBefore(before)).toList();
        List<Row> rows = eligible.stream().limit(limit).toList();
        LocalDate nextBefore = eligible.size() > rows.size() ? rows.getLast().periodStart() : null;
        return new Page(rows, nextBefore);
    }

    private static boolean samePeriod(Period period, LocalDate a, LocalDate b) {
        return switch (period) {
            case DAILY -> a.equals(b);
            case WEEKLY -> a.get(IsoFields.WEEK_BASED_YEAR) == b.get(IsoFields.WEEK_BASED_YEAR)
                    && a.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR) == b.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
            case MONTHLY -> YearMonth.from(a).equals(YearMonth.from(b));
        };
    }

    /**
     * The period containing {@code lastDate} is unfinished if it contains today and a session can still happen in
     * it: a later weekday, or today's session when no bar exists for it yet (weekday holidays are not modelled).
     */
    private static boolean unfinished(Period period, LocalDate lastDate, LocalDate today, LocalDate lastBarDate) {
        LocalDate periodEnd = period == Period.WEEKLY
                ? lastDate.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY))
                : YearMonth.from(lastDate).atEndOfMonth();
        if (today.isAfter(periodEnd) || !samePeriod(period, lastDate, today)) {
            return false;
        }
        boolean todayOpen = lastBarDate == null || lastBarDate.isBefore(today);
        for (LocalDate d = today; !d.isAfter(periodEnd); d = d.plusDays(1)) {
            boolean weekday = d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY;
            if (weekday && (d.isAfter(today) || todayOpen)) {
                return true;
            }
        }
        return false;
    }
}
