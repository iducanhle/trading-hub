package com.earningstracker.domain;

import java.util.List;
import java.util.Objects;

/**
 * Earnings stats over the most recent up-to-8 reported quarters that have data (§5): beat rate among quarters with
 * a result, the streak of identical most-recent results (INLINE breaks it) and the mean absolute reaction-day move.
 */
public final class EarningsStatsCalculator {

    public record Outcome(EarningsResult result, Double reactionDayPercent) {
    }

    public record Streak(EarningsResult result, int count) {
    }

    public record Stats(int quartersAnalyzed, Double beatRate, Streak streak, Double avgAbsReactionPercent) {
    }

    static final int MAX_QUARTERS = 8;

    private EarningsStatsCalculator() {
    }

    /** @param newestFirst reported quarters, newest first */
    public static Stats stats(List<Outcome> newestFirst) {
        List<Outcome> analyzed = newestFirst.stream()
                .filter(o -> o.result() != null || o.reactionDayPercent() != null)
                .limit(MAX_QUARTERS)
                .toList();
        List<EarningsResult> results = analyzed.stream().map(Outcome::result).filter(Objects::nonNull).toList();

        Double beatRate = results.isEmpty() ? null
                : results.stream().filter(r -> r == EarningsResult.BEAT).count() * 100.0 / results.size();

        Streak streak = null;
        if (!results.isEmpty() && results.getFirst() != EarningsResult.INLINE) {
            int count = 0;
            while (count < results.size() && results.get(count) == results.getFirst()) {
                count++;
            }
            streak = new Streak(results.getFirst(), count);
        }

        Double avgAbsReaction = analyzed.stream().map(Outcome::reactionDayPercent).filter(Objects::nonNull)
                .mapToDouble(Math::abs).average().stream().boxed().findFirst().orElse(null);
        return new Stats(analyzed.size(), beatRate, streak, avgAbsReaction);
    }
}
