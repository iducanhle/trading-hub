package com.earningstracker.t212;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.earningstracker.t212.T212Fill.Side;
import org.junit.jupiter.api.Test;

class T212GroupEngineTest {

    private static final Instant T0 = Instant.parse("2026-01-05T15:00:00Z");

    private static T212Fill trade(String id, int day, Side side, double quantity, double value, double fees) {
        return new T212Fill(id, id, T0.plusSeconds(day * 86_400L), "AAPL_US_EQ", side, T212Fill.TRADE, "TRADE",
                quantity, value / quantity, "USD", value, fees, 0, null, null, "MARKET");
    }

    private static T212Fill sell(String id, int day, double quantity, double value, double realizedPnl) {
        return new T212Fill(id, id, T0.plusSeconds(day * 86_400L), "AAPL_US_EQ", Side.SELL, T212Fill.TRADE, "TRADE",
                quantity, value / quantity, "USD", value, 0, 0, null, realizedPnl, "MARKET");
    }

    private static T212Fill split(String id, int day, Side side, double quantity) {
        return new T212Fill(id, id, T0.plusSeconds(day * 86_400L), "AAPL_US_EQ", side, T212Fill.STOCK_SPLIT,
                "STOCK_SPLIT", quantity, 0.0, "USD", 0, 0, 0, null, null, null);
    }

    @Test
    void eachGroupHasItsOwnAveragePrice() {
        List<T212Fill> fills = List.of(
                trade("b1", 0, Side.BUY, 10, 1000, 0),
                trade("b2", 1, Side.BUY, 10, 2000, 0),
                trade("s1", 2, Side.SELL, 10, 1798, 2)); // proceeds 1,800 before the fee

        T212GroupEngine.Result result = T212GroupEngine.compute(fills,
                Map.of("b1", "long", "b2", "swing", "s1", "swing"), List.of("long", "swing", "empty"));

        T212GroupEngine.GroupResult swing = result.groups().get("swing");
        assertThat(swing.realizedPnl()).isCloseTo(-200, within(1e-9)); // 1,800 − 10 × 200, not Trading 212's +300
        assertThat(swing.fees()).isEqualTo(2);
        assertThat(swing.bought()).isEqualTo(2000);
        assertThat(swing.sold()).isEqualTo(1798);
        assertThat(swing.tradeCount()).isEqualTo(2);
        assertThat(swing.lots()).isEmpty();
        assertThat(result.groupRealized()).containsEntry("s1", -200.0);

        T212GroupEngine.GroupResult longTerm = result.groups().get("long");
        assertThat(longTerm.lots()).containsEntry("AAPL_US_EQ", new T212GroupEngine.Lot(10, 1000));
        assertThat(longTerm.realizedPnl()).isZero();
        assertThat(result.groups().get("empty").lots()).isEmpty();
        assertThat(result.oversells()).isEmpty();
    }

    @Test
    void buyCostIsBeforeFees() {
        List<T212Fill> fills = List.of(trade("b1", 0, Side.BUY, 4, 404, 4), trade("s1", 1, Side.SELL, 2, 250, 0));

        T212GroupEngine.Result result = T212GroupEngine.compute(fills, Map.of("b1", "g", "s1", "g"), List.of("g"));

        T212GroupEngine.GroupResult g = result.groups().get("g");
        assertThat(g.lots()).containsEntry("AAPL_US_EQ", new T212GroupEngine.Lot(2, 200));
        assertThat(g.realizedPnl()).isCloseTo(50, within(1e-9));
        assertThat(g.fees()).isEqualTo(4);
    }

    @Test
    void tradesOutsideGroupsAreIgnored() {
        List<T212Fill> fills = List.of(trade("b1", 0, Side.BUY, 10, 1000, 0), trade("s1", 1, Side.SELL, 5, 600, 0));

        T212GroupEngine.Result result = T212GroupEngine.compute(fills, Map.of("b1", "g"), List.of("g"));

        assertThat(result.groups().get("g").lots()).containsEntry("AAPL_US_EQ", new T212GroupEngine.Lot(10, 1000));
        assertThat(result.groupRealized()).isEmpty();
    }

    @Test
    void reportsASellOfMoreSharesThanTheGroupHolds() {
        List<T212Fill> fills = List.of(
                trade("b1", 0, Side.BUY, 10, 1000, 0),
                trade("b2", 1, Side.BUY, 2, 200, 0),
                trade("s1", 2, Side.SELL, 5, 600, 0));

        T212GroupEngine.Result result = T212GroupEngine.compute(fills, Map.of("b2", "g", "s1", "g"), List.of("g"));

        assertThat(result.oversells()).containsExactly(new T212GroupEngine.Oversell("g", "AAPL_US_EQ", "s1", 3, 360));
        assertThat(result.groups().get("g").lots()).isEmpty(); // only the 2 shares held are taken off
        // Only the 2 shares with a cost count: 2/5 of the proceeds (240) minus their cost (200).
        assertThat(result.groupRealized()).containsEntry("s1", 40.0);
    }

    @Test
    void theSharesSoldWithoutACostCountTrading212sResult() {
        List<T212Fill> fills = List.of(
                trade("b1", 0, Side.BUY, 10, 1000, 0),
                trade("b2", 1, Side.BUY, 2, 200, 0),
                sell("s1", 2, 5, 600, 100),
                sell("s2", 3, 1, 130, 30));

        T212GroupEngine.Result result = T212GroupEngine.compute(fills, Map.of("b2", "g", "s1", "g", "s2", "g"),
                List.of("g"));

        // s1: the 2 held shares make 240 − 200 = 40; the other 3 count 3/5 of Trading 212's 100.
        assertThat(result.groupRealized()).containsEntry("s1", 100.0);
        // s2: nothing held, so all of Trading 212's result.
        assertThat(result.groupRealized()).containsEntry("s2", 30.0);
        assertThat(result.groups().get("g").realizedPnl()).isCloseTo(130, within(1e-9));
        assertThat(result.oversells()).hasSize(2);
    }

    @Test
    void aSplitScalesTheGroupsSharesAndKeepsTheirCost() {
        List<T212Fill> fills = List.of(
                trade("b1", 0, Side.BUY, 6, 600, 0),
                trade("b2", 1, Side.BUY, 4, 500, 0),
                split("x1", 2, Side.SELL, 10),
                split("x2", 2, Side.BUY, 40),
                trade("s1", 3, Side.SELL, 8, 160, 0));

        T212GroupEngine.Result result = T212GroupEngine.compute(fills, Map.of("b2", "g", "s1", "g"), List.of("g"));

        // 4 shares for 500 became 16; selling 8 takes half the cost off.
        T212GroupEngine.GroupResult g = result.groups().get("g");
        assertThat(g.lots().get("AAPL_US_EQ").quantity()).isCloseTo(8, within(1e-9));
        assertThat(g.lots().get("AAPL_US_EQ").cost()).isCloseTo(250, within(1e-9));
        assertThat(g.realizedPnl()).isCloseTo(-90, within(1e-9));
        assertThat(result.oversells()).isEmpty();
    }
}
