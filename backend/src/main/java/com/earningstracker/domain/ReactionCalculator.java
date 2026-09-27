package com.earningstracker.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;

/**
 * Price reaction around a report dated D (§5), with a window of N trading days:
 * <ul>
 * <li>BMO or DMH: pre-close P = close of the trading day before D, reaction day R = D;</li>
 * <li>AMC: P = close of D, R = the next trading day;</li>
 * <li>UNKNOWN: treated as AMC in the US and as BMO in Europe ({@code timeAssumed}).</li>
 * </ul>
 * If D is not a trading day, R is the next trading day and P the one before it.
 */
public final class ReactionCalculator {

    public record Reaction(Double preRunUpPercent, Double gapPercent, Double reactionDayPercent,
            Double driftPercent) {
    }

    private ReactionCalculator() {
    }

    public static boolean timeAssumed(ReportTime time) {
        return time == null || time == ReportTime.UNKNOWN;
    }

    /** The timing rule used for the calculation. */
    public static ReportTime effectiveTime(ReportTime time, Region region) {
        if (timeAssumed(time)) {
            return region == Region.US ? ReportTime.AMC : ReportTime.BMO;
        }
        return time;
    }

    /** Null when the reaction day is not in the bars yet (upcoming or too recent) or no pre-close exists. */
    public static Reaction reaction(List<PriceBar> bars, LocalDate reportDate, ReportTime time, Region region,
            int window) {
        int[] indexes = indexes(bars, reportDate, effectiveTime(time, region));
        int p = indexes[0];
        int r = indexes[1];
        if (p < 0 || r < 0 || r >= bars.size()) {
            return null;
        }
        double preClose = bars.get(p).close();
        PriceBar reactionBar = bars.get(r);
        return new Reaction(
                p - window >= 0 ? Percent.change(preClose, bars.get(p - window).close()) : null,
                Percent.change(reactionBar.open(), preClose),
                Percent.change(reactionBar.close(), preClose),
                r + window < bars.size() ? Percent.change(bars.get(r + window).close(), reactionBar.close()) : null);
    }

    /**
     * The bar where the move shows. For reports whose reaction day is not in the bars yet, the next weekday by the
     * same rule (holidays are not known in advance).
     */
    public static LocalDate reactionDay(List<PriceBar> bars, LocalDate reportDate, ReportTime time, Region region) {
        ReportTime effective = effectiveTime(time, region);
        int r = indexes(bars, reportDate, effective)[1];
        if (r >= 0 && r < bars.size()) {
            return bars.get(r).date();
        }
        LocalDate day = effective == ReportTime.AMC ? reportDate.plusDays(1) : reportDate;
        while (day.getDayOfWeek() == DayOfWeek.SATURDAY || day.getDayOfWeek() == DayOfWeek.SUNDAY) {
            day = day.plusDays(1);
        }
        return day;
    }

    /** [pre-close index, reaction index]; the reaction index may equal bars.size() when it has not happened yet. */
    private static int[] indexes(List<PriceBar> bars, LocalDate reportDate, ReportTime effective) {
        if (effective == ReportTime.AMC) {
            int p = Percent.lastIndexOnOrBefore(bars, reportDate);
            return new int[] {p, p < 0 ? -1 : p + 1};
        }
        int r = Percent.firstIndexOnOrAfter(bars, reportDate);
        if (r < 0) {
            return new int[] {bars.size() - 1, bars.size()};
        }
        return new int[] {r - 1, r};
    }
}
