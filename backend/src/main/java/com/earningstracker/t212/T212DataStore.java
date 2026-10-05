package com.earningstracker.t212;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.earningstracker.cache.DocumentStore;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

/**
 * Synced Trading 212 history in backend-only Firestore documents, bucketed to keep reads low:
 * {@code t212/{uid}/orders/{YYYY-MM}}, {@code dividends/{YYYY}}, {@code transactions/{YYYY}} (each
 * {@code {items: [...]}}, UTC periods) and {@code instruments/all}. Loading a user's whole history costs one read
 * per bucket; it is then kept in memory until unused for 6 hours.
 */
@Component
public class T212DataStore {

    static final String ORDERS = "orders";
    static final String DIVIDENDS = "dividends";
    static final String TRANSACTIONS = "transactions";
    static final String INSTRUMENTS = "instruments";
    /** Every subcollection {@link #deleteAll} removes, including the {@link T212SnapshotStore} one. */
    static final List<String> COLLECTIONS = List.of(ORDERS, DIVIDENDS, TRANSACTIONS, INSTRUMENTS,
            T212SnapshotStore.SNAPSHOTS);
    private static final String INSTRUMENTS_DOC = "all";
    /** Rough upper bound of one stored item, to stay clear of Firestore's 1 MiB document limit. */
    static final int APPROX_ITEM_BYTES = 400;
    static final int MAX_BUCKET_BYTES = 900_000;

    private final DocumentStore store;
    private final Cache<String, T212UserData> cache = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofHours(6))
            .build();

    public T212DataStore(DocumentStore store) {
        this.store = store;
    }

    /** The user's synced data, from memory or (once) from Firestore. */
    public T212UserData load(String uid) {
        return cache.get(uid, this::read);
    }

    /** Replaces the in-memory snapshot (during a sync, before {@link #persist}). */
    public void put(String uid, T212UserData data) {
        cache.put(uid, data);
    }

    /** Writes the given buckets of {@code data}; buckets are keys from {@link #orderBucket} etc. */
    public void persist(String uid, T212UserData data, Set<String> orderBuckets, Set<String> dividendBuckets,
            Set<String> transactionBuckets, boolean instruments) {
        writeBuckets(uid, ORDERS, orderBuckets, data.fills().values(), fill -> orderBucket(fill.executedAt()),
                T212DataStore::fillDoc);
        writeBuckets(uid, DIVIDENDS, dividendBuckets, data.dividends().values(),
                dividend -> yearBucket(dividend.paidAt()), T212DataStore::dividendDoc);
        writeBuckets(uid, TRANSACTIONS, transactionBuckets, data.transactions().values(),
                transaction -> yearBucket(transaction.at()), T212DataStore::transactionDoc);
        if (instruments) {
            List<Map<String, Object>> items = data.instruments().values().stream()
                    .map(T212DataStore::instrumentDoc).toList();
            store.set(path(uid, INSTRUMENTS), INSTRUMENTS_DOC, Map.of("items", items));
        }
        cache.put(uid, data);
    }

    /** Deletes every synced document of the user and forgets the in-memory copy. */
    public void deleteAll(String uid) {
        cache.invalidate(uid);
        for (String collection : COLLECTIONS) {
            String path = path(uid, collection);
            for (String id : store.list(path).keySet()) {
                store.delete(path, id);
            }
        }
        cache.invalidate(uid);
    }

    public void forget(String uid) {
        cache.invalidate(uid);
    }

    static String orderBucket(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC).toLocalDate().toString().substring(0, 7);
    }

    static String yearBucket(Instant instant) {
        return String.valueOf(instant.atOffset(ZoneOffset.UTC).getYear());
    }

    private static String path(String uid, String collection) {
        return T212StateStore.COLLECTION + "/" + uid + "/" + collection;
    }

    private <T> void writeBuckets(String uid, String collection, Set<String> buckets, Collection<T> items,
            Function<T, String> bucketOf, Function<T, Map<String, Object>> toDoc) {
        if (buckets.isEmpty()) {
            return;
        }
        Map<String, List<T>> byBucket = items.stream().collect(Collectors.groupingBy(bucketOf));
        for (String bucket : new TreeSet<>(buckets)) {
            List<T> bucketItems = byBucket.getOrDefault(bucket, List.of());
            if ((long) bucketItems.size() * APPROX_ITEM_BYTES > MAX_BUCKET_BYTES) {
                throw new IllegalStateException(collection + "/" + bucket + " has " + bucketItems.size()
                        + " items, too many for one Firestore document");
            }
            store.set(path(uid, collection), bucket, Map.of("items", bucketItems.stream().map(toDoc).toList()));
        }
    }

    private T212UserData read(String uid) {
        List<T212Fill> fills = new ArrayList<>();
        store.list(path(uid, ORDERS)).values().forEach(doc -> items(doc).forEach(item -> fills.add(fill(item))));
        List<T212DividendPayment> dividends = new ArrayList<>();
        store.list(path(uid, DIVIDENDS)).values()
                .forEach(doc -> items(doc).forEach(item -> dividends.add(dividend(item))));
        List<T212CashTransaction> transactions = new ArrayList<>();
        store.list(path(uid, TRANSACTIONS)).values()
                .forEach(doc -> items(doc).forEach(item -> transactions.add(transaction(item))));
        Map<String, T212InstrumentInfo> instruments = new LinkedHashMap<>();
        store.get(path(uid, INSTRUMENTS), INSTRUMENTS_DOC).ifPresent(doc -> items(doc).forEach(item -> {
            T212InstrumentInfo info = instrument(item);
            instruments.put(info.ticker(), info);
        }));
        return T212UserData.EMPTY.withFills(fills).withDividends(dividends).withTransactions(transactions)
                .withInstruments(instruments);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> items(Map<String, Object> doc) {
        return doc.get("items") instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
    }

    // ---- (de)serialization: short field names, epoch millis for instants ----

    private static Map<String, Object> fillDoc(T212Fill f) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", f.id());
        doc.put("orderId", f.orderId());
        doc.put("at", f.executedAt().toEpochMilli());
        doc.put("ticker", f.ticker());
        doc.put("side", f.side().name());
        doc.put("kind", f.kind());
        doc.put("fillType", f.fillType());
        doc.put("qty", f.quantity());
        doc.put("price", f.price());
        doc.put("priceCcy", f.priceCurrency());
        doc.put("value", f.value());
        doc.put("fees", f.fees());
        doc.put("taxes", f.taxes());
        doc.put("fx", f.fxRate());
        doc.put("pnl", f.realizedPnl());
        doc.put("orderType", f.orderType());
        if (f.currency() != null) {
            doc.put("ccy", f.currency());
        }
        return doc;
    }

    private static T212Fill fill(Map<String, Object> d) {
        return new T212Fill(str(d, "id"), str(d, "orderId"), instant(d, "at"), str(d, "ticker"),
                "SELL".equals(d.get("side")) ? T212Fill.Side.SELL : T212Fill.Side.BUY, str(d, "kind"),
                str(d, "fillType"), num(d, "qty", 0), numOrNull(d, "price"), str(d, "priceCcy"), num(d, "value", 0),
                num(d, "fees", 0), num(d, "taxes", 0), numOrNull(d, "fx"), numOrNull(d, "pnl"), str(d, "orderType"),
                str(d, "ccy"));
    }

    private static Map<String, Object> dividendDoc(T212DividendPayment p) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", p.id());
        doc.put("at", p.paidAt().toEpochMilli());
        doc.put("ticker", p.ticker());
        doc.put("qty", p.quantity());
        doc.put("amount", p.amount());
        doc.put("perShare", p.grossPerShare());
        doc.put("perShareCcy", p.grossPerShareCurrency());
        doc.put("type", p.type());
        if (p.currency() != null) {
            doc.put("ccy", p.currency());
        }
        return doc;
    }

    private static T212DividendPayment dividend(Map<String, Object> d) {
        return new T212DividendPayment(str(d, "id"), instant(d, "at"), str(d, "ticker"), num(d, "qty", 0),
                num(d, "amount", 0), numOrNull(d, "perShare"), str(d, "perShareCcy"), str(d, "type"),
                str(d, "ccy"));
    }

    private static Map<String, Object> transactionDoc(T212CashTransaction t) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", t.id());
        doc.put("at", t.at().toEpochMilli());
        doc.put("type", t.type());
        doc.put("amount", t.amount());
        doc.put("ccy", t.currency());
        return doc;
    }

    private static T212CashTransaction transaction(Map<String, Object> d) {
        return new T212CashTransaction(str(d, "id"), instant(d, "at"), str(d, "type"), num(d, "amount", 0),
                str(d, "ccy"));
    }

    private static Map<String, Object> instrumentDoc(T212InstrumentInfo i) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("ticker", i.ticker());
        doc.put("name", i.name());
        doc.put("isin", i.isin());
        doc.put("ccy", i.currency());
        doc.put("symbol", i.symbol());
        return doc;
    }

    /** Maps the symbol again on load, so a mapper fix applies before the next sync rewrites the document. */
    private static T212InstrumentInfo instrument(Map<String, Object> d) {
        return new T212InstrumentInfo(str(d, "ticker"), str(d, "name"), str(d, "isin"), str(d, "ccy"),
                T212SymbolMapper.map(str(d, "ticker"), str(d, "ccy")));
    }

    private static String str(Map<String, Object> d, String key) {
        return d.get(key) instanceof String s ? s : null;
    }

    private static double num(Map<String, Object> d, String key, double fallback) {
        return d.get(key) instanceof Number n ? n.doubleValue() : fallback;
    }

    private static Double numOrNull(Map<String, Object> d, String key) {
        return d.get(key) instanceof Number n ? n.doubleValue() : null;
    }

    private static Instant instant(Map<String, Object> d, String key) {
        return d.get(key) instanceof Number n ? Instant.ofEpochMilli(n.longValue()) : Instant.EPOCH;
    }
}
