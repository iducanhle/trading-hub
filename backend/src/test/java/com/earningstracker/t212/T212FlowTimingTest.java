package com.earningstracker.t212;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

class T212FlowTimingTest {

    private static final Instant PROCESSED = Instant.parse("2026-11-03T01:18:00Z");

    private static T212SnapshotStore.Point point(String at, double cash) {
        return new T212SnapshotStore.Point(Instant.parse(at), 100_000 + cash, cash);
    }

    private static T212CashTransaction withdrawal(String id, Instant at, double amount) {
        return new T212CashTransaction(id, at, "WITHDRAW", amount, "CZK");
    }

    private static T212Fill buy(String at) {
        return new T212Fill("f1", "o1", Instant.parse(at), "AAPL_US_EQ", T212Fill.Side.BUY, "MARKET",
                T212Fill.TRADE, 1, 100.0, "USD", 15_000, 0, 0, null, null, "MARKET", null);
    }

    @Test
    void aWithdrawalLeftTheCashAtTheStepOfItsAmount() {
        List<T212SnapshotStore.Point> points = List.of(
                point("2026-11-02T09:00:00Z", 20_000),
                point("2026-11-02T09:01:00Z", 5_000), // requested: cash −15,000
                point("2026-11-02T15:00:00Z", 5_000.5));

        assertThat(T212FlowTiming.withdrawalTimes(points, List.of(withdrawal("w1", PROCESSED, -15_000)), List.of(),
                "CZK")).containsEntry("w1", Instant.parse("2026-11-02T09:01:00Z"));
    }

    @Test
    void aStepWithAFillInsideIsNotAWithdrawal() {
        List<T212SnapshotStore.Point> points = List.of(
                point("2026-11-01T09:00:00Z", 35_000),
                point("2026-11-01T09:01:00Z", 20_000), // the withdrawal
                point("2026-11-02T14:30:00Z", 20_000),
                point("2026-11-02T14:31:00Z", 5_000)); // a buy of exactly 15,000

        assertThat(T212FlowTiming.withdrawalTimes(points, List.of(withdrawal("w1", PROCESSED, -15_000)),
                List.of(buy("2026-11-02T14:30:20Z")), "CZK"))
                .containsEntry("w1", Instant.parse("2026-11-01T09:01:00Z"));
    }

    @Test
    void withdrawalsProcessedTogetherMayHaveBeenRequestedAsOneStep() {
        List<T212SnapshotStore.Point> points = List.of(
                point("2026-11-02T09:00:00Z", 40_000),
                point("2026-11-02T09:01:00Z", 10_000)); // 15,000 + 12,000 + 3,000

        assertThat(T212FlowTiming.withdrawalTimes(points, List.of(
                withdrawal("w1", PROCESSED, -15_000),
                withdrawal("w2", PROCESSED.plusSeconds(1), -12_000),
                withdrawal("w3", PROCESSED.plusSeconds(25), -3_000)), List.of(), "CZK"))
                .containsOnlyKeys("w1", "w2", "w3")
                .containsValue(Instant.parse("2026-11-02T09:01:00Z"));
    }

    @Test
    void withoutAMatchingStepTheWithdrawalKeepsItsOwnTime() {
        List<T212SnapshotStore.Point> old = List.of(
                point("2026-10-01T09:00:00Z", 20_000),
                point("2026-10-01T09:01:00Z", 5_000)); // beyond the look-back
        List<T212SnapshotStore.Point> noCash = List.of(
                new T212SnapshotStore.Point(Instant.parse("2026-11-02T09:00:00Z"), 120_000),
                new T212SnapshotStore.Point(Instant.parse("2026-11-02T09:01:00Z"), 105_000));
        List<T212CashTransaction> w = List.of(withdrawal("w1", PROCESSED, -15_000));

        assertThat(T212FlowTiming.withdrawalTimes(old, w, List.of(), "CZK")).isEmpty();
        assertThat(T212FlowTiming.withdrawalTimes(noCash, w, List.of(), "CZK")).isEmpty();
        assertThat(T212FlowTiming.withdrawalTimes(old, List.of(new T212CashTransaction("w2",
                Instant.parse("2026-10-01T10:00:00Z"), "WITHDRAW", -15_000, "USD")), List.of(), "CZK")).isEmpty();
    }
}
