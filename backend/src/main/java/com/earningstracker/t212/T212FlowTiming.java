package com.earningstracker.t212;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * When a withdrawal left the account. Trading 212 dates a {@code WITHDRAW} when it is processed, but the money leaves
 * the account value when it is requested, up to days earlier, so counting it at its own time skews the account
 * history and today's profit/loss by the whole amount until then. The stored cash ({@link T212SnapshotStore}) is
 * not noisy like the value: a withdrawal shows there as a step of exactly its amount. Pure.
 */
public final class T212FlowTiming {

    /** How far before its processing time a withdrawal's request is looked for. */
    static final Duration LOOKBACK = Duration.ofDays(14);
    /** A snapshot is taken on the minute, so the step can show up shortly after the processing time. */
    static final Duration SLACK = Duration.ofMinutes(5);
    /** Withdrawals processed this close together form a batch, which may have been requested as one step. */
    static final Duration BATCH = Duration.ofMinutes(10);
    private static final double TOLERANCE = 0.005;

    private T212FlowTiming() {
    }

    private record Step(Instant at, double amount) {
    }

    /**
     * The time each account-currency {@code WITHDRAW} left the cash, by transaction id: the point after the latest
     * cash step of exactly its amount (or of its batch's sum) before it was processed. A step is skipped when a
     * fill or another cash transaction falls inside it, so a buy of the same amount is not taken for a withdrawal.
     * Withdrawals without a matching step are left out (their own time stands).
     */
    public static Map<String, Instant> withdrawalTimes(List<T212SnapshotStore.Point> points,
            Collection<T212CashTransaction> transactions, Collection<T212Fill> fills, String accountCurrency) {
        List<T212CashTransaction> withdrawals = transactions.stream()
                .filter(t -> t.type().equals("WITHDRAW") && t.amount() < 0)
                .filter(t -> t.currency() == null || t.currency().equalsIgnoreCase(accountCurrency))
                .sorted(Comparator.comparing(T212CashTransaction::at)).toList();
        if (withdrawals.isEmpty()) {
            return Map.of();
        }
        List<Instant> otherMoves = new ArrayList<>();
        fills.forEach(f -> otherMoves.add(f.executedAt()));
        transactions.stream().filter(t -> !t.type().equals("WITHDRAW")).forEach(t -> otherMoves.add(t.at()));
        otherMoves.sort(null);
        List<Step> steps = steps(points, otherMoves);

        Map<String, Instant> times = new HashMap<>();
        Set<Step> used = new HashSet<>();
        for (List<T212CashTransaction> batch : batches(withdrawals)) {
            List<T212CashTransaction> unmatched = new ArrayList<>();
            for (T212CashTransaction w : batch) {
                Step step = latestMatch(steps, used, w.amount(), w.at());
                if (step == null) {
                    unmatched.add(w);
                } else {
                    used.add(step);
                    times.put(w.id(), min(step.at(), w.at()));
                }
            }
            if (unmatched.size() > 1) {
                double sum = unmatched.stream().mapToDouble(T212CashTransaction::amount).sum();
                Instant first = unmatched.getFirst().at();
                Step step = latestMatch(steps, used, sum, first);
                if (step != null) {
                    used.add(step);
                    unmatched.forEach(w -> times.put(w.id(), min(step.at(), w.at())));
                }
            }
        }
        return times;
    }

    /** Cash changes between consecutive points that both know the cash, without a fill or transaction inside. */
    private static List<Step> steps(List<T212SnapshotStore.Point> points, List<Instant> otherMoves) {
        List<Step> steps = new ArrayList<>();
        T212SnapshotStore.Point previous = null;
        for (T212SnapshotStore.Point p : points) {
            if (p.cash() == null) {
                previous = null;
                continue;
            }
            if (previous != null) {
                double change = p.cash() - previous.cash();
                if (Math.abs(change) > TOLERANCE && !anyIn(otherMoves, previous.at(), p.at())) {
                    steps.add(new Step(p.at(), change));
                }
            }
            previous = p;
        }
        return steps;
    }

    /** Whether a sorted list has an instant in {@code (after, until]}. */
    private static boolean anyIn(List<Instant> sorted, Instant after, Instant until) {
        int low = 0;
        int high = sorted.size();
        while (low < high) {
            int mid = (low + high) >>> 1;
            if (sorted.get(mid).isAfter(after)) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        return low < sorted.size() && !sorted.get(low).isAfter(until);
    }

    private static Step latestMatch(List<Step> steps, Set<Step> used, double amount, Instant processedAt) {
        Instant from = processedAt.minus(LOOKBACK);
        Instant until = processedAt.plus(SLACK);
        for (int i = steps.size() - 1; i >= 0; i--) {
            Step step = steps.get(i);
            if (step.at().isAfter(until) || used.contains(step)) {
                continue;
            }
            if (!step.at().isAfter(from)) {
                return null;
            }
            if (Math.abs(step.amount() - amount) < TOLERANCE) {
                return step;
            }
        }
        return null;
    }

    private static List<List<T212CashTransaction>> batches(List<T212CashTransaction> sorted) {
        List<List<T212CashTransaction>> batches = new ArrayList<>();
        List<T212CashTransaction> current = new ArrayList<>();
        for (T212CashTransaction w : sorted) {
            if (!current.isEmpty() && w.at().isAfter(current.getLast().at().plus(BATCH))) {
                batches.add(current);
                current = new ArrayList<>();
            }
            current.add(w);
        }
        batches.add(current);
        return batches;
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }
}
