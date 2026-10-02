package com.earningstracker.t212;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.earningstracker.t212.T212PortfolioEngine.InstrumentResult;
import org.junit.jupiter.api.Test;

class T212PortfolioEngineTest {

    private static final String T = "AAPL_US_EQ";
    private final List<T212Fill> fills = new ArrayList<>();
    private final List<T212DividendPayment> dividends = new ArrayList<>();
    private int sequence;

    private static Instant day(String date) {
        return Instant.parse(date + "T15:00:00Z");
    }

    private void buy(String date, double quantity, double value) {
        fill(date, T212Fill.Side.BUY, T212Fill.TRADE, quantity, value, 0, 0, null);
    }

    private void sell(String date, double quantity, double value, Double t212Realized) {
        fill(date, T212Fill.Side.SELL, T212Fill.TRADE, quantity, value, 0, 0, t212Realized);
    }

    private void fill(String date, T212Fill.Side side, String kind, double quantity, double value, double fees,
            double taxes, Double realized) {
        sequence++;
        fills.add(new T212Fill("o" + sequence, "o" + sequence, day(date), T, side, kind, kind, quantity,
                quantity == 0 ? null : value / quantity, "USD", value, fees, taxes, null, realized, "MARKET"));
    }

    private T212PortfolioEngine.Result compute(T212Period period) {
        return compute(period, null);
    }

    private T212PortfolioEngine.Result compute(T212Period period, Map<String, T212Live.Position> positions) {
        T212UserData data = T212UserData.EMPTY.withFills(fills).withDividends(dividends);
        return T212PortfolioEngine.compute(data, positions, period);
    }

    private InstrumentResult allTime() {
        return compute(T212Period.ALL_TIME).instruments().get(T);
    }

    @Test
    void partialSellsUseTheAverageCostAtTheTime() {
        buy("2026-01-05", 10, 1000);
        buy("2026-02-05", 10, 1200); // average 110
        sell("2026-03-05", 5, 600, null); // 600 − 5 × 110 = 50

        InstrumentResult r = allTime();
        assertThat(r.realizedPnl()).isEqualTo(50);
        assertThat(r.open()).isTrue();
        assertThat(r.heldQuantity()).isEqualTo(15);
        assertThat(r.boughtQuantity()).isEqualTo(20);
        assertThat(r.boughtValue()).isEqualTo(2200);
        assertThat(r.soldValue()).isEqualTo(600);
        assertThat(r.tradeCount()).isEqualTo(3);
        assertThat(r.firstTradeAt()).isEqualTo(day("2026-01-05"));
        assertThat(r.lastTradeAt()).isEqualTo(day("2026-03-05"));
    }

    @Test
    void trading212sRealizedResultIsPreferred() {
        buy("2026-01-05", 10, 1000);
        sell("2026-03-05", 5, 600, 98.76);

        assertThat(allTime().realizedPnl()).isEqualTo(98.76);
        assertThat(compute(T212Period.ALL_TIME).fills().get("o2").realizedPnl()).isEqualTo(98.76);
    }

    @Test
    void aFullCloseThenARebuyStartsAFreshCostBasis() {
        buy("2026-01-05", 10, 1000);
        sell("2026-02-05", 10, 1500, null); // +500, closed
        buy("2026-03-05", 2, 300);
        sell("2026-04-05", 1, 140, null); // average is 150 now: −10

        T212PortfolioEngine.Result result = compute(T212Period.ALL_TIME);
        assertThat(result.instruments().get(T).realizedPnl()).isEqualTo(490);
        assertThat(result.fills().get("o2").positionAfter()).isZero();
        assertThat(result.fills().get("o4").realizedPnl()).isEqualTo(-10);
        assertThat(result.fills().get("o4").positionAfter()).isEqualTo(1);
    }

    @Test
    void fractionalSharesCloseCleanly() {
        buy("2026-01-05", 0.5, 50);
        buy("2026-01-06", 0.25, 30);
        sell("2026-01-07", 0.75, 90, null);

        InstrumentResult r = allTime();
        assertThat(r.realizedPnl()).isCloseTo(10, within(1e-9));
        assertThat(r.open()).isFalse();
        assertThat(r.heldQuantity()).isZero();
    }

    @Test
    void realizedIsBeforeFeesAndTheTotalIsWhatCameBackMinusWhatWasPaid() {
        // netValue includes the fees: 1,000 paid (of which 6.50 fees), 1,100 received (after a 2.00 fee)
        fill("2026-01-05", T212Fill.Side.BUY, T212Fill.TRADE, 10, 1000, 1.5, 5, null);
        fill("2026-02-05", T212Fill.Side.SELL, T212Fill.TRADE, 10, 1100, 2, 0, null);

        InstrumentResult r = allTime();
        assertThat(r.realizedPnl()).isEqualTo(108.5); // 1,102 − 993.50, as Trading 212 computes it
        assertThat(r.fees()).isEqualTo(8.5);
        assertThat(r.totalPnl(true)).isEqualTo(100); // 1,100 − 1,000
    }

    @Test
    void aStockSplitKeepsTheCostAndChangesTheAverage() {
        buy("2026-01-05", 10, 1000);
        // As Trading 212 sends a 4-for-1 split: the 10 old shares go out, 40 new ones come in, no value
        fill("2026-02-01", T212Fill.Side.SELL, T212Fill.STOCK_SPLIT, 10, 0, 0, 0, null);
        fill("2026-02-01", T212Fill.Side.BUY, T212Fill.STOCK_SPLIT, 40, 0, 0, 0, null);
        sell("2026-03-05", 20, 800, null); // average 25: 800 − 500 = 300

        T212PortfolioEngine.Result result = compute(T212Period.ALL_TIME);
        assertThat(result.instruments().get(T).realizedPnl()).isEqualTo(300);
        assertThat(result.instruments().get(T).heldQuantity()).isEqualTo(20);
        assertThat(result.instruments().get(T).tradeCount()).isEqualTo(2); // the split is not a trade
        assertThat(result.fills().get("o2").positionAfter()).isZero();
        assertThat(result.fills().get("o3").positionAfter()).isEqualTo(40);
    }

    @Test
    void dividendsCountInTheTotal() {
        buy("2026-01-05", 10, 1000);
        dividends.add(new T212DividendPayment("d1", day("2026-02-10"), T, 10, 2.5, 0.25, "USD", "ORDINARY"));
        dividends.add(new T212DividendPayment("d2", day("2026-05-10"), T, 10, 2.5, 0.25, "USD", "ORDINARY"));

        assertThat(allTime().dividends()).isEqualTo(5);
        assertThat(allTime().totalPnl(true)).isEqualTo(5);
    }

    @Test
    void aPeriodCountsItsOwnSellsAgainstTheWholeCostHistory() {
        buy("2025-11-05", 10, 1000);
        buy("2026-01-05", 10, 2000); // average 150
        sell("2026-03-05", 10, 1800, null); // 1800 − 1500 = 300
        dividends.add(new T212DividendPayment("d1", day("2026-03-20"), T, 10, 3, 0.3, "USD", "ORDINARY"));

        T212Period march = T212Period.of(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 31), "Europe/Prague");
        InstrumentResult r = compute(march).instruments().get(T);

        assertThat(r.realizedPnl()).isEqualTo(300);
        assertThat(r.boughtQuantity()).isZero();
        assertThat(r.soldQuantity()).isEqualTo(10);
        assertThat(r.dividends()).isEqualTo(3);
        assertThat(r.tradeCount()).isEqualTo(1);
        assertThat(r.activeInPeriod()).isTrue();
        assertThat(r.totalBoughtAllTime()).isEqualTo(3000);

        T212Period february = T212Period.of(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 28), "UTC");
        assertThat(compute(february).instruments().get(T).activeInPeriod()).isFalse();
        assertThat(T212PortfolioEngine.inPeriod(compute(february), february)).isEmpty();
    }

    @Test
    void periodDaysFollowTheTimeZone() {
        buy("2026-01-05", 1, 100);
        fills.add(new T212Fill("late", "late", Instant.parse("2026-03-31T22:30:00Z"), T, T212Fill.Side.SELL,
                T212Fill.TRADE, "TRADE", 1, 120.0, "USD", 120, 0, 0, null, null, "MARKET"));

        // 22:30 UTC on 31 March is already 1 April in Prague
        assertThat(compute(T212Period.of(LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 1), "Europe/Prague"))
                .instruments().get(T).realizedPnl()).isEqualTo(20);
        assertThat(compute(T212Period.of(LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 1), "UTC"))
                .instruments().get(T).realizedPnl()).isZero();
    }

    @Test
    void livePositionsDecideWhatIsOpenAndAddUnrealizedForAllTimeOnly() {
        buy("2026-01-05", 10, 1000);
        T212Live.Position aapl = new T212Live.Position(T, "Apple", null, "USD", "USD", 10, 100.0, 90.0, 900.0, 1000.0,
                -100.0);
        T212Live.Position held = new T212Live.Position("SAPd_EQ", "SAP", null, "EUR", "EUR", 2, 200.0, 210.0, 420.0,
                400.0, 20.0);

        T212PortfolioEngine.Result result = compute(T212Period.ALL_TIME, Map.of(T, aapl, "SAPd_EQ", held));
        InstrumentResult r = result.instruments().get(T);
        assertThat(r.open()).isTrue();
        assertThat(r.unrealizedPnl()).isEqualTo(-100);
        assertThat(r.totalPnl(true)).isEqualTo(-100);
        assertThat(r.totalPnl(false)).isZero();
        // Held without any synced history (e.g. transferred in): listed, open, nothing realized
        assertThat(result.instruments().get("SAPd_EQ").open()).isTrue();
        assertThat(result.instruments().get("SAPd_EQ").realizedPnl()).isZero();

        // Positions known and this one not among them: closed, whatever the history says
        assertThat(compute(T212Period.ALL_TIME, Map.of()).instruments().get(T).open()).isFalse();
    }
}
