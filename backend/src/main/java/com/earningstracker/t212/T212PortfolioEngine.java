package com.earningstracker.t212;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * Average-cost P/L per instrument (the method Trading 212 shows), from the stored fills and dividends plus the
 * live positions. Money is in the account currency.
 *
 * <ul>
 *   <li>A buy adds its quantity and its value <em>before fees</em> to the position's cost. A sell takes
 *       {@code average cost × quantity} off the cost; its realized result is Trading 212's
 *       {@code realisedProfitLoss}, or else its proceeds before fees minus that cost. This is how Trading 212
 *       computes it: checked on a real account, 1,102 of 1,104 sells within 1% (docs/DATA-SOURCES.md).
 *       {@code netValue} includes the fees (paid on buys, deducted on sells), so fees count once, in
 *       {@code fees}.</li>
 *   <li>A stock split arrives as a sell of the old shares and a buy of the new ones (same time, no value): it
 *       changes the quantity only, and the cost carries over even when the quantity passes through zero. Another
 *       corporate action without a value changes the quantity too; one with a value counts like a trade.</li>
 *   <li>The cost basis always comes from the whole history; the period only selects which sells, buys,
 *       dividends and fees are counted.</li>
 * </ul>
 */
public final class T212PortfolioEngine {

    static final double EPSILON = 1e-9;

    private T212PortfolioEngine() {
    }

    /** One fill with the realized result used and the shares held right after it. */
    public record FillResult(T212Fill fill, Double realizedPnl, double positionAfter) {
    }

    /**
     * One instrument's figures. Period fields cover only fills and dividends in the period; {@code live} is the
     * open position as of now (null if not held or unknown).
     */
    public record InstrumentResult(String ticker, boolean open, double heldQuantity, T212Live.Position live,
            double boughtQuantity, double boughtValue, double soldQuantity, double soldValue, double realizedPnl,
            double dividends, double fees, int tradeCount, boolean activeInPeriod, double totalBoughtAllTime,
            Instant firstTradeAt, Instant lastTradeAt) {

        public Double unrealizedPnl() {
            return open && live != null ? live.unrealizedPnl() : null;
        }

        /** realized + dividends − fees, plus unrealized only if {@code includeUnrealized}. */
        public double totalPnl(boolean includeUnrealized) {
            double total = realizedPnl + dividends - fees;
            Double unrealized = unrealizedPnl();
            return includeUnrealized && unrealized != null ? total + unrealized : total;
        }
    }

    public record Result(Map<String, InstrumentResult> instruments, Map<String, FillResult> fills) {
    }

    /**
     * @param positions live open positions by ticker, or null when Trading 212 could not be asked; then "open"
     *                  follows from the history
     */
    public static Result compute(T212UserData data, Map<String, T212Live.Position> positions, T212Period period) {
        Map<String, List<T212Fill>> byTicker = data.fills().values().stream()
                .sorted(Comparator.comparing(T212Fill::executedAt).thenComparing(T212Fill::id))
                .collect(Collectors.groupingBy(T212Fill::ticker, LinkedHashMap::new, Collectors.toList()));
        Map<String, Double> dividendsInPeriod = new LinkedHashMap<>();
        Set<String> dividendTickers = new TreeSet<>();
        for (T212DividendPayment dividend : data.dividends().values()) {
            dividendTickers.add(dividend.ticker());
            if (period.contains(dividend.paidAt())) {
                dividendsInPeriod.merge(dividend.ticker(), dividend.amount(), Double::sum);
            }
        }
        Set<String> tickers = new TreeSet<>(byTicker.keySet());
        tickers.addAll(dividendTickers);
        if (positions != null) {
            tickers.addAll(positions.keySet());
        }

        Map<String, InstrumentResult> instruments = new LinkedHashMap<>();
        Map<String, FillResult> fillResults = new LinkedHashMap<>();
        for (String ticker : tickers) {
            double quantity = 0;
            double cost = 0;
            double boughtQuantity = 0;
            double boughtValue = 0;
            double soldQuantity = 0;
            double soldValue = 0;
            double realized = 0;
            double fees = 0;
            double totalBought = 0;
            int trades = 0;
            Instant first = null;
            Instant last = null;
            for (T212Fill fill : byTicker.getOrDefault(ticker, List.of())) {
                boolean inPeriod = period.contains(fill.executedAt());
                boolean valued = T212Fill.TRADE.equals(fill.kind())
                        || (!T212Fill.STOCK_SPLIT.equals(fill.kind()) && fill.value() > 0);
                Double fillRealized = null;
                if (!valued) {
                    quantity = Math.max(0, quantity + (fill.side() == T212Fill.Side.BUY ? fill.quantity()
                            : -fill.quantity()));
                    if (quantity < EPSILON) {
                        quantity = 0;
                        if (!T212Fill.STOCK_SPLIT.equals(fill.kind())) {
                            cost = 0; // e.g. shares removed after a delisting
                        }
                    }
                } else if (fill.side() == T212Fill.Side.BUY) {
                    quantity += fill.quantity();
                    cost += Math.max(0, fill.value() - fill.fees() - fill.taxes());
                    totalBought += fill.value();
                    if (inPeriod) {
                        boughtQuantity += fill.quantity();
                        boughtValue += fill.value();
                    }
                } else {
                    double average = quantity > EPSILON ? cost / quantity : 0;
                    double sold = Math.min(fill.quantity(), quantity);
                    double soldCost = average * sold;
                    fillRealized = fill.realizedPnl() != null ? fill.realizedPnl()
                            : fill.value() + fill.fees() + fill.taxes() - soldCost;
                    cost -= soldCost;
                    quantity -= fill.quantity();
                    if (quantity < EPSILON) {
                        quantity = 0;
                        cost = 0;
                    }
                    if (inPeriod) {
                        soldQuantity += fill.quantity();
                        soldValue += fill.value();
                        realized += fillRealized;
                    }
                }
                if (inPeriod) {
                    fees += fill.fees() + fill.taxes();
                    if (valued) {
                        trades++;
                    }
                }
                if (T212Fill.TRADE.equals(fill.kind())) {
                    first = first == null ? fill.executedAt() : first;
                    last = fill.executedAt();
                }
                fillResults.put(fill.id(), new FillResult(fill, fillRealized, quantity));
            }
            T212Live.Position live = positions == null ? null : positions.get(ticker);
            boolean open = positions != null ? live != null && live.quantity() > EPSILON : quantity > EPSILON;
            double dividends = dividendsInPeriod.getOrDefault(ticker, 0.0);
            boolean active = trades > 0 || dividendsInPeriod.containsKey(ticker) || fees > 0;
            instruments.put(ticker, new InstrumentResult(ticker, open, open && live != null ? live.quantity()
                    : open ? quantity : 0, open ? live : null, boughtQuantity, boughtValue, soldQuantity, soldValue,
                    round(realized), round(dividends), round(fees), trades, active, totalBought, first, last));
        }
        return new Result(instruments, fillResults);
    }

    /** Instruments in the period: all of them for all time, else those with a trade, dividend or fee in it. */
    public static List<InstrumentResult> inPeriod(Result result, T212Period period) {
        List<InstrumentResult> list = new ArrayList<>();
        for (InstrumentResult instrument : result.instruments().values()) {
            if (period.allTime() || instrument.activeInPeriod()) {
                list.add(instrument);
            }
        }
        return list;
    }

    static double round(double value) {
        return Math.round(value * 1e6) / 1e6;
    }
}
