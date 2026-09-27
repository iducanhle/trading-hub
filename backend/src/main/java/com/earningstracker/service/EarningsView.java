package com.earningstracker.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.earningstracker.domain.EarningsMath;
import com.earningstracker.domain.EarningsResult;
import com.earningstracker.domain.EarningsStatsCalculator;
import com.earningstracker.domain.ReactionCalculator;
import com.earningstracker.domain.ReactionCalculator.Reaction;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Region;

/**
 * Splits merged reports into the next upcoming event and up to 12 reported quarters (newest first), each with its
 * result and price reaction.
 */
record EarningsView(EarningsReport upcoming, List<EarningsView.Quarter> quarters) {

    record Quarter(EarningsReport report, EarningsResult result, Reaction reaction, boolean timeAssumed,
            LocalDate reactionDay) {
    }

    static final int MAX_QUARTERS = 12;
    static final EarningsView EMPTY = new EarningsView(null, List.of());

    /**
     * A report is reported once its date has passed, or on its date once the actual is known; the upcoming event
     * is the earliest unreported one.
     */
    static EarningsView of(List<EarningsReport> reports, List<PriceBar> bars, Region region, LocalDate today,
            int windowDays) {
        EarningsReport upcoming = null;
        List<Quarter> quarters = new ArrayList<>();
        for (EarningsReport report : reports) {
            if (report.date() == null) {
                continue;
            }
            boolean reported = report.date().isBefore(today) || (report.date().equals(today) && report.epsActual() != null);
            if (!reported) {
                if (report.epsActual() == null && (upcoming == null || report.date().isBefore(upcoming.date()))) {
                    upcoming = report;
                }
            } else if (quarters.size() < MAX_QUARTERS) {
                quarters.add(new Quarter(report, EarningsMath.result(report.epsEstimate(), report.epsActual()),
                        ReactionCalculator.reaction(bars, report.date(), report.time(), region, windowDays),
                        ReactionCalculator.timeAssumed(report.time()),
                        ReactionCalculator.reactionDay(bars, report.date(), report.time(), region)));
            }
        }
        return new EarningsView(upcoming, List.copyOf(quarters));
    }

    EarningsStatsCalculator.Stats stats() {
        return EarningsStatsCalculator.stats(quarters.stream()
                .map(q -> new EarningsStatsCalculator.Outcome(q.result(),
                        q.reaction() == null ? null : q.reaction().reactionDayPercent()))
                .toList());
    }
}
