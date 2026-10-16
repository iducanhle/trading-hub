package com.earningstracker.t212;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Each group's shares, cost and results from the trades assigned to it (docs/CONTRACT.md, "Groups"). A group works
 * like a Trading 212 pie: its own average price, from its own buys. Money is in the account currency.
 *
 * <ul>
 *   <li>A buy adds its quantity and its value before fees to the group's cost of that stock; a sell takes the
 *       group's average × quantity off it. The sell's result is its proceeds before fees minus that cost.</li>
 *   <li>Stock splits and corporate actions without a value are never in a group: they scale every group's shares of
 *       the stock by the account's quantity after ÷ before (fills at the same moment count as one event), keeping
 *       the cost, as {@link T212PortfolioEngine} does for the whole position.</li>
 *   <li>A sell of more shares than the group holds at that moment is an oversell (the user has not assigned its
 *       buys yet). It is allowed and reported; only the shares held are taken off, and its result counts only the
 *       part of the proceeds that matches them, since the rest has no cost in the group.</li>
 * </ul>
 */
public final class T212GroupEngine {

    private static final double EPSILON = T212PortfolioEngine.EPSILON;
    /** Fractional shares: a sell may exceed the held quantity by this share of it before it counts as an oversell. */
    private static final double TOLERANCE = 1e-6;

    private T212GroupEngine() {
    }

    /** Shares of one stock held in a group, and their cost before fees. */
    public record Lot(double quantity, double cost) {
    }

    public record GroupResult(String groupId, Map<String, Lot> lots, double bought, double sold, double realizedPnl,
            double fees, int tradeCount) {
    }

    /** A sell of {@code ticker} in {@code groupId} for {@code missing} more shares than the group held then. */
    public record Oversell(String groupId, String ticker, String fillId, double missing) {
    }

    /**
     * @param groupRealized fill id → the sell's result at its group's average price (sells in a group only)
     */
    public record Result(Map<String, GroupResult> groups, Map<String, Double> groupRealized,
            List<Oversell> oversells) {
    }

    /**
     * @param fills   every fill of the user (any order), money in the account currency
     * @param groupOf fill id → group id of the assigned trades
     * @param groupIds every group, so that empty ones get a result too
     */
    public static Result compute(java.util.Collection<T212Fill> fills, Map<String, String> groupOf,
            List<String> groupIds) {
        Map<String, Acc> accs = new LinkedHashMap<>();
        groupIds.forEach(id -> accs.put(id, new Acc()));
        Map<String, Double> groupRealized = new HashMap<>();
        List<Oversell> oversells = new ArrayList<>();

        Map<String, List<T212Fill>> byTicker = fills.stream()
                .sorted(Comparator.comparing(T212Fill::executedAt).thenComparing(T212Fill::id))
                .collect(Collectors.groupingBy(T212Fill::ticker, LinkedHashMap::new, Collectors.toList()));
        for (Map.Entry<String, List<T212Fill>> entry : byTicker.entrySet()) {
            String ticker = entry.getKey();
            List<T212Fill> list = entry.getValue();
            double accountQuantity = 0;
            for (int i = 0; i < list.size(); i++) {
                T212Fill fill = list.get(i);
                if (!valued(fill)) {
                    // One event: every non-valued fill at this moment (a split is a sell of the old shares and a
                    // buy of the new ones).
                    double before = accountQuantity;
                    boolean split = false;
                    int j = i;
                    for (; j < list.size() && !valued(list.get(j))
                            && list.get(j).executedAt().equals(fill.executedAt()); j++) {
                        T212Fill part = list.get(j);
                        split |= T212Fill.STOCK_SPLIT.equals(part.kind());
                        accountQuantity = Math.max(0, accountQuantity + (part.side() == T212Fill.Side.BUY
                                ? part.quantity() : -part.quantity()));
                    }
                    i = j - 1;
                    if (accountQuantity < EPSILON) {
                        accountQuantity = 0;
                    }
                    if (before > EPSILON) {
                        double ratio = accountQuantity / before;
                        for (Acc acc : accs.values()) {
                            acc.scale(ticker, ratio, split);
                        }
                    }
                    continue;
                }
                accountQuantity = Math.max(0, accountQuantity
                        + (fill.side() == T212Fill.Side.BUY ? fill.quantity() : -fill.quantity()));
                String groupId = groupOf.get(fill.id());
                Acc acc = groupId == null ? null : accs.get(groupId);
                if (acc == null) {
                    continue;
                }
                acc.fees += fill.fees() + fill.taxes();
                acc.tradeCount++;
                double[] lot = acc.lots.computeIfAbsent(ticker, t -> new double[2]);
                if (fill.side() == T212Fill.Side.BUY) {
                    lot[0] += fill.quantity();
                    lot[1] += Math.max(0, fill.value() - fill.fees() - fill.taxes());
                    acc.bought += fill.value();
                } else {
                    if (fill.quantity() > lot[0] * (1 + TOLERANCE) + EPSILON) {
                        oversells.add(new Oversell(groupId, ticker, fill.id(), fill.quantity() - lot[0]));
                    }
                    double average = lot[0] > EPSILON ? lot[1] / lot[0] : 0;
                    double sold = Math.min(fill.quantity(), lot[0]);
                    double soldCost = average * sold;
                    double proceeds = (fill.value() + fill.fees() + fill.taxes()) * (sold / fill.quantity());
                    double realized = proceeds - soldCost;
                    groupRealized.put(fill.id(), T212PortfolioEngine.round(realized));
                    acc.realized += realized;
                    acc.sold += fill.value();
                    lot[0] -= sold;
                    lot[1] -= soldCost;
                    if (lot[0] < EPSILON) {
                        lot[0] = 0;
                        lot[1] = 0;
                    }
                }
            }
        }

        Map<String, GroupResult> groups = new LinkedHashMap<>();
        accs.forEach((id, acc) -> {
            Map<String, Lot> lots = new LinkedHashMap<>();
            acc.lots.forEach((ticker, lot) -> {
                if (lot[0] > EPSILON) {
                    lots.put(ticker, new Lot(lot[0], lot[1]));
                }
            });
            groups.put(id, new GroupResult(id, lots, acc.bought, acc.sold, acc.realized, acc.fees, acc.tradeCount));
        });
        return new Result(groups, groupRealized, oversells);
    }

    /** Same rule as {@link T212PortfolioEngine}: a trade, or a corporate action with a value. */
    static boolean valued(T212Fill fill) {
        return T212Fill.TRADE.equals(fill.kind()) || (!T212Fill.STOCK_SPLIT.equals(fill.kind()) && fill.value() > 0);
    }

    private static final class Acc {
        /** ticker → {quantity, cost} */
        final Map<String, double[]> lots = new LinkedHashMap<>();
        double bought;
        double sold;
        double realized;
        double fees;
        int tradeCount;

        void scale(String ticker, double ratio, boolean split) {
            double[] lot = lots.get(ticker);
            if (lot == null) {
                return;
            }
            lot[0] *= ratio;
            if (lot[0] < EPSILON) {
                lot[0] = 0;
                if (!split) {
                    lot[1] = 0; // e.g. shares removed after a delisting
                }
            }
        }
    }
}
