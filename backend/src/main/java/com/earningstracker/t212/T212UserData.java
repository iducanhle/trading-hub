package com.earningstracker.t212;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

/** Everything synced for one user. Immutable: a sync builds a new snapshot and swaps it in. */
public record T212UserData(Map<String, T212Fill> fills, Map<String, T212DividendPayment> dividends,
        Map<String, T212CashTransaction> transactions, Map<String, T212InstrumentInfo> instruments) {

    public static final T212UserData EMPTY = new T212UserData(Map.of(), Map.of(), Map.of(), Map.of());

    public T212UserData {
        fills = Map.copyOf(fills);
        dividends = Map.copyOf(dividends);
        transactions = Map.copyOf(transactions);
        instruments = Map.copyOf(instruments);
    }

    public T212UserData withFills(Collection<T212Fill> added) {
        return new T212UserData(merge(fills, added, T212Fill::id), dividends, transactions, instruments);
    }

    public T212UserData withDividends(Collection<T212DividendPayment> added) {
        return new T212UserData(fills, merge(dividends, added, T212DividendPayment::id), transactions, instruments);
    }

    public T212UserData withTransactions(Collection<T212CashTransaction> added) {
        return new T212UserData(fills, dividends, merge(transactions, added, T212CashTransaction::id), instruments);
    }

    public T212UserData withInstruments(Map<String, T212InstrumentInfo> replaced) {
        return new T212UserData(fills, dividends, transactions, replaced);
    }

    public boolean isEmpty() {
        return fills.isEmpty() && dividends.isEmpty() && transactions.isEmpty();
    }

    private static <T> Map<String, T> merge(Map<String, T> existing, Collection<T> added, Function<T, String> id) {
        Map<String, T> merged = new LinkedHashMap<>(existing);
        added.forEach(item -> merged.put(id.apply(item), item));
        return merged;
    }
}
