package com.earningstracker.t212;

import static com.earningstracker.provider.ProviderTestSupport.JSON;
import static com.earningstracker.provider.ProviderTestSupport.fixture;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class T212NormalizerTest {

    private static List<JsonNode> items(String fixture) {
        return JSON.readTree(fixture("t212/" + fixture)).path("items").values().stream().toList();
    }

    @Test
    void aSellIsPositiveWithSideAndRealizedResult() {
        T212Fill sell = T212Normalizer.fill(items("orders-page1.json").get(0), "EUR").orElseThrow();

        assertThat(sell.id()).isEqualTo("1003-2003");
        assertThat(sell.side()).isEqualTo(T212Fill.Side.SELL);
        assertThat(sell.kind()).isEqualTo(T212Fill.TRADE);
        assertThat(sell.quantity()).isEqualTo(5);
        assertThat(sell.price()).isEqualTo(200.0);
        assertThat(sell.priceCurrency()).isEqualTo("USD");
        assertThat(sell.value()).isEqualTo(900.0);
        assertThat(sell.fees()).isEqualTo(1.35);
        assertThat(sell.taxes()).isZero();
        assertThat(sell.realizedPnl()).isEqualTo(90.5);
        assertThat(sell.executedAt()).isEqualTo(Instant.parse("2026-09-20T15:00:00Z"));
        assertThat(sell.orderType()).isEqualTo("MARKET");
    }

    @Test
    void ordersThatNeverFilledAreSkipped() {
        assertThat(T212Normalizer.fill(items("orders-page1.json").get(1), "EUR")).isEmpty();
    }

    @Test
    void penceAreConvertedAndAStampDutyInGbpBecomesAccountCurrency() {
        T212Fill buy = T212Normalizer.fill(items("orders-page1.json").get(2), "EUR").orElseThrow();

        assertThat(buy.price()).isEqualTo(120.0);
        assertThat(buy.priceCurrency()).isEqualTo("GBP");
        assertThat(buy.realizedPnl()).isNull(); // buys carry no realized result
        // 1,400 EUR for 10 × 120 GBP → 1.1667 EUR per GBP; 6 GBP stamp duty ≈ 7 EUR
        assertThat(buy.taxes()).isCloseTo(7.0, within(0.001));
        assertThat(buy.fees()).isZero();
    }

    @Test
    void aSplitIsACorporateActionWithItsDirectionFromTheQuantity() {
        T212Fill split = T212Normalizer.fill(items("orders-page2.json").get(0), "EUR").orElseThrow();

        assertThat(split.kind()).isEqualTo(T212Fill.STOCK_SPLIT);
        assertThat(split.side()).isEqualTo(T212Fill.Side.BUY);
        assertThat(split.quantity()).isEqualTo(9);
        assertThat(split.value()).isZero();
    }

    @Test
    void positiveSellQuantitiesWorkToo() {
        JsonNode item = JSON.readTree(fixture("t212/orders-page1.json").replace("\"quantity\": -5", "\"quantity\": 5")
                .replace("\"netValue\": 900.0", "\"netValue\": -900.0")).path("items").get(0);

        T212Fill sell = T212Normalizer.fill(item, "EUR").orElseThrow();
        assertThat(sell.side()).isEqualTo(T212Fill.Side.SELL);
        assertThat(sell.quantity()).isEqualTo(5);
        assertThat(sell.value()).isEqualTo(900.0);
    }

    @Test
    void tradesSettledInAnotherWalletKeepTheirCurrency() {
        JsonNode item = JSON.readTree(fixture("t212/orders-page1.json")
                .replace("\"currency\": \"EUR\", \"fxRate\": 0.9", "\"currency\": \"USD\", \"fxRate\": 1"))
                .path("items").get(0);

        assertThat(T212Normalizer.fill(item, "EUR").orElseThrow().currency()).isEqualTo("USD");
        assertThat(T212Normalizer.fill(items("orders-page1.json").get(0), "EUR").orElseThrow().currency()).isNull();
    }

    @Test
    void readsInstrumentsDividendsAndTransactions() {
        assertThat(T212Normalizer.instrument(items("orders-page1.json").get(2))).contains(
                new T212InstrumentInfo("AZNl_EQ", "AstraZeneca", "GB0009895292", "GBX", null));

        T212DividendPayment dividend = T212Normalizer.dividend(items("dividends.json").get(0), "EUR").orElseThrow();
        assertThat(dividend).isEqualTo(new T212DividendPayment("div-1", Instant.parse("2026-08-15T00:00:00Z"),
                "AAPL_US_EQ", 10, 2.1, 0.26, "USD", "ORDINARY"));

        List<T212CashTransaction> transactions = items("transactions.json").stream()
                .map(item -> T212Normalizer.transaction(item, "EUR")).flatMap(Optional::stream).toList();
        assertThat(transactions).extracting(T212CashTransaction::type, T212CashTransaction::amount).containsExactly(
                org.assertj.core.groups.Tuple.tuple("INTEREST_ON_FREE_CASH", 1.2),
                org.assertj.core.groups.Tuple.tuple("WITHDRAW", -200.0),
                org.assertj.core.groups.Tuple.tuple("DEPOSIT", 5000.0));
    }
}
