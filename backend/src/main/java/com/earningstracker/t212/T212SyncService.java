package com.earningstracker.t212;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;

import com.earningstracker.provider.t212.T212Client;
import com.earningstracker.provider.t212.T212Client.History;
import com.earningstracker.provider.t212.T212Credentials;
import com.earningstracker.provider.t212.T212Exception;
import com.earningstracker.provider.t212.T212Exception.Kind;
import com.earningstracker.web.dto.T212Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * Copies a user's Trading 212 history (orders, dividends, transactions) into {@link T212DataStore}.
 *
 * <p>History is newest first. Until a history type has been read to the end once, a sync pages through all of
 * it; afterwards it stops at the first page that holds known items and nothing new (a whole page, not a single
 * item, so an order filled late still has a page of overlap). One sync per user at a time. A disconnect or an
 * account change cancels a running sync, which then saves nothing more.
 */
@Service
public class T212SyncService {

    public static final int PAGE_SIZE = T212Client.MAX_PAGE_SIZE;
    private static final Logger log = LoggerFactory.getLogger(T212SyncService.class);

    /** Counters of one sync. */
    public record Result(int newFills, int newDividends, int newTransactions, int pages) {
    }

    private record PageOutcome(int known, int fresh) {
    }

    private static final class CancelledException extends RuntimeException {
        CancelledException() {
            super("sync cancelled", null, false, false);
        }
    }

    private final T212Client client;
    private final T212ConnectionService connection;
    private final T212StateStore states;
    private final T212DataStore data;
    private final T212SyncTracker syncs;
    private final ExecutorService executor;
    private final Clock clock;

    public T212SyncService(T212Client client, T212ConnectionService connection, T212StateStore states,
            T212DataStore data, T212SyncTracker syncs, ExecutorService executor, Clock clock) {
        this.client = client;
        this.connection = connection;
        this.states = states;
        this.data = data;
        this.syncs = syncs;
        this.executor = executor;
        this.clock = clock;
    }

    /**
     * Starts a sync in the background and returns the status (with {@code syncState: RUNNING}). If one is already
     * running, returns its status and starts nothing. 409 if not connected.
     */
    public T212Dtos.Status start(String uid) {
        connection.requireCredentials(uid);
        Optional<T212SyncTracker.Run> run = syncs.begin(uid, clock.instant());
        if (run.isPresent()) {
            markRunning(uid, run.get());
            executor.execute(() -> execute(uid, run.get()));
        }
        return connection.status(uid);
    }

    /** Runs a sync in the calling thread (scheduled job); empty if one was already running or it failed. */
    public Optional<Result> runNow(String uid) {
        Optional<T212SyncTracker.Run> run = syncs.begin(uid, clock.instant());
        if (run.isEmpty()) {
            return Optional.empty();
        }
        markRunning(uid, run.get());
        return Optional.ofNullable(execute(uid, run.get()));
    }

    private Result execute(String uid, T212SyncTracker.Run run) {
        try {
            Result result = sync(uid, run);
            finish(uid, run, T212State.SyncState.IDLE, clock.instant(), null);
            log.info("Trading 212 sync of {}: {} new trades, {} dividends, {} transactions ({} pages)", uid,
                    result.newFills(), result.newDividends(), result.newTransactions(), result.pages());
            return result;
        } catch (CancelledException e) {
            log.info("Trading 212 sync of {} cancelled", uid);
            return null;
        } catch (T212Exception e) {
            log.warn("Trading 212 sync of {} failed: {}", uid, e.getMessage());
            forgetUnsaved(uid);
            if (e.kind() == Kind.UNAUTHORIZED || e.kind() == Kind.FORBIDDEN) {
                connection.markInvalid(uid, T212Errors.message(e));
            } else {
                finish(uid, run, T212State.SyncState.FAILED, null,
                        new T212State.Error(T212Errors.code(e).name(), T212Errors.message(e)));
            }
            return null;
        } catch (ApiException e) {
            forgetUnsaved(uid);
            // requireCredentials: not connected (any more) or the key cannot be decrypted (already recorded).
            if (e.code() != ErrorCode.T212_INVALID_CREDENTIALS) {
                finish(uid, run, T212State.SyncState.FAILED, null, new T212State.Error(e.code().name(),
                        e.getMessage()));
            }
            return null;
        } catch (RuntimeException e) {
            log.error("Trading 212 sync of {} failed unexpectedly", uid, e);
            forgetUnsaved(uid);
            finish(uid, run, T212State.SyncState.FAILED, null, new T212State.Error(ErrorCode.T212_UNAVAILABLE.name(),
                    "The sync failed unexpectedly. Try again later."));
            return null;
        } finally {
            syncs.end(uid, run);
        }
    }

    private Result sync(String uid, T212SyncTracker.Run run) {
        T212Credentials credentials = connection.requireCredentials(uid);
        T212State state = states.find(uid).orElseThrow(CancelledException::new);
        String account = state.accountIdHash();
        String currency = state.accountCurrency();
        Set<String> complete = new HashSet<>(state.completeHistories());
        Map<String, T212InstrumentInfo> seen = new LinkedHashMap<>();
        int pages = 0;

        // Orders
        int[] newFills = {0};
        Set<String> orderBuckets = new TreeSet<>();
        pages += read(uid, run, account, credentials, History.ORDERS, complete, items -> {
            T212UserData current = data.load(uid);
            List<T212Fill> fresh = new ArrayList<>();
            int known = 0;
            for (JsonNode item : items) {
                Optional<T212Fill> fill = T212Normalizer.fill(item, currency);
                if (fill.isEmpty()) {
                    continue;
                }
                T212Normalizer.instrument(item).ifPresent(info -> seen.put(info.ticker(), info));
                if (current.fills().containsKey(fill.get().id())) {
                    known++;
                } else {
                    fresh.add(fill.get());
                    orderBuckets.add(T212DataStore.orderBucket(fill.get().executedAt()));
                }
            }
            newFills[0] += fresh.size();
            update(uid, run, account, current.withFills(fresh));
            return new PageOutcome(known, fresh.size());
        });
        save(uid, run, account, complete, orderBuckets, Set.of(), Set.of(), false);

        // Dividends
        int[] newDividends = {0};
        Set<String> dividendBuckets = new TreeSet<>();
        pages += read(uid, run, account, credentials, History.DIVIDENDS, complete, items -> {
            T212UserData current = data.load(uid);
            List<T212DividendPayment> fresh = new ArrayList<>();
            int known = 0;
            for (JsonNode item : items) {
                Optional<T212DividendPayment> dividend = T212Normalizer.dividend(item);
                if (dividend.isEmpty()) {
                    continue;
                }
                T212Normalizer.instrument(item).ifPresent(info -> seen.putIfAbsent(info.ticker(), info));
                if (current.dividends().containsKey(dividend.get().id())) {
                    known++;
                } else {
                    fresh.add(dividend.get());
                    dividendBuckets.add(T212DataStore.yearBucket(dividend.get().paidAt()));
                }
            }
            newDividends[0] += fresh.size();
            update(uid, run, account, current.withDividends(fresh));
            return new PageOutcome(known, fresh.size());
        });
        save(uid, run, account, complete, Set.of(), dividendBuckets, Set.of(), false);

        // Transactions
        int[] newTransactions = {0};
        Set<String> transactionBuckets = new TreeSet<>();
        pages += read(uid, run, account, credentials, History.TRANSACTIONS, complete, items -> {
            T212UserData current = data.load(uid);
            List<T212CashTransaction> fresh = new ArrayList<>();
            int known = 0;
            for (JsonNode item : items) {
                Optional<T212CashTransaction> transaction = T212Normalizer.transaction(item, currency);
                if (transaction.isEmpty()) {
                    continue;
                }
                if (current.transactions().containsKey(transaction.get().id())) {
                    known++;
                } else {
                    fresh.add(transaction.get());
                    transactionBuckets.add(T212DataStore.yearBucket(transaction.get().at()));
                }
            }
            newTransactions[0] += fresh.size();
            update(uid, run, account, current.withTransactions(fresh));
            return new PageOutcome(known, fresh.size());
        });

        boolean instrumentsChanged = updateInstruments(uid, run, account, credentials, seen);
        save(uid, run, account, complete, Set.of(), Set.of(), transactionBuckets, instrumentsChanged);
        return new Result(newFills[0], newDividends[0], newTransactions[0], pages);
    }

    /** Pages through one history; marks it complete when its end was reached. Returns the number of pages. */
    private int read(String uid, T212SyncTracker.Run run, String account, T212Credentials credentials,
            History history, Set<String> complete, Function<List<JsonNode>, PageOutcome> handle) {
        boolean incremental = complete.contains(history.name());
        String path = history.firstPage(PAGE_SIZE);
        int pages = 0;
        while (path != null) {
            checkCancelled(run);
            T212Client.Page page = client.historyPage(credentials, path);
            pages++;
            PageOutcome outcome = handle.apply(page.items());
            if (incremental && outcome.known() > 0 && outcome.fresh() == 0) {
                return pages;
            }
            path = page.nextPagePath();
        }
        complete.add(history.name());
        return pages;
    }

    /**
     * Adds the instruments seen in this sync, maps symbols for all of them, and asks Trading 212's instrument list
     * only if some instrument has no currency (the list is large and limited to 1 call per 50 s).
     */
    private boolean updateInstruments(String uid, T212SyncTracker.Run run, String account,
            T212Credentials credentials, Map<String, T212InstrumentInfo> seen) {
        T212UserData current = data.load(uid);
        Map<String, T212InstrumentInfo> merged = new LinkedHashMap<>(current.instruments());
        seen.forEach((ticker, info) -> merged.merge(ticker, info, (old, now) -> new T212InstrumentInfo(ticker,
                firstNonNull(now.name(), old.name()), firstNonNull(now.isin(), old.isin()),
                firstNonNull(now.currency(), old.currency()), null)));
        current.fills().values().forEach(fill -> merged.putIfAbsent(fill.ticker(),
                new T212InstrumentInfo(fill.ticker(), null, null, null, null)));
        current.dividends().values().forEach(dividend -> merged.putIfAbsent(dividend.ticker(),
                new T212InstrumentInfo(dividend.ticker(), null, null, null, null)));

        if (merged.values().stream().anyMatch(info -> info.currency() == null)) {
            checkCancelled(run);
            try {
                for (JsonNode instrument : client.instruments(credentials)) {
                    String ticker = instrument.path("ticker").isString() ? instrument.path("ticker").stringValue()
                            : null;
                    T212InstrumentInfo known = ticker == null ? null : merged.get(ticker);
                    if (known != null && (known.currency() == null || known.name() == null)) {
                        merged.put(ticker, new T212InstrumentInfo(ticker,
                                firstNonNull(known.name(), text(instrument, "name")),
                                firstNonNull(known.isin(), text(instrument, "isin")),
                                firstNonNull(known.currency(), text(instrument, "currencyCode")), null));
                    }
                }
            } catch (T212Exception e) {
                if (e.kind() == Kind.UNAUTHORIZED) {
                    throw e;
                }
                log.info("Trading 212 instrument list not available ({}); keeping what history items said",
                        e.getMessage());
            }
        }
        Map<String, T212InstrumentInfo> mapped = new LinkedHashMap<>();
        merged.forEach((ticker, info) -> mapped.put(ticker, new T212InstrumentInfo(ticker, info.name(), info.isin(),
                info.currency(), T212SymbolMapper.map(ticker, info.currency()))));
        if (mapped.equals(current.instruments())) {
            return false;
        }
        update(uid, run, account, current.withInstruments(mapped));
        return true;
    }

    /** Swaps in a new in-memory snapshot, unless the sync was cancelled or the account changed meanwhile. */
    private void update(String uid, T212SyncTracker.Run run, String account, T212UserData snapshot) {
        ReentrantLock lock = connection.lock(uid);
        lock.lock();
        try {
            checkStillValid(uid, run, account);
            data.put(uid, snapshot);
        } finally {
            lock.unlock();
        }
    }

    private void save(String uid, T212SyncTracker.Run run, String account, Set<String> complete,
            Set<String> orderBuckets, Set<String> dividendBuckets, Set<String> transactionBuckets,
            boolean instruments) {
        ReentrantLock lock = connection.lock(uid);
        lock.lock();
        try {
            T212State state = checkStillValid(uid, run, account);
            data.persist(uid, data.load(uid), orderBuckets, dividendBuckets, transactionBuckets, instruments);
            if (!state.completeHistories().equals(complete)) {
                states.save(uid, state.withCompleteHistories(complete));
            }
        } finally {
            lock.unlock();
        }
    }

    private T212State checkStillValid(String uid, T212SyncTracker.Run run, String account) {
        checkCancelled(run);
        T212State state = states.find(uid).orElseThrow(CancelledException::new);
        if (!account.equals(state.accountIdHash())) {
            throw new CancelledException();
        }
        return state;
    }

    /**
     * After a failure, items read since the last save exist only in memory; dropping that copy makes the next
     * read come from Firestore, so the next sync sees them as new and saves them.
     */
    private void forgetUnsaved(String uid) {
        ReentrantLock lock = connection.lock(uid);
        lock.lock();
        try {
            data.forget(uid);
        } finally {
            lock.unlock();
        }
    }

    private static void checkCancelled(T212SyncTracker.Run run) {
        if (run.cancelled().get()) {
            throw new CancelledException();
        }
    }

    private void markRunning(String uid, T212SyncTracker.Run run) {
        ReentrantLock lock = connection.lock(uid);
        lock.lock();
        try {
            states.find(uid).ifPresent(state -> states.save(uid, state.withSync(T212State.SyncState.RUNNING,
                    run.startedAt(), state.lastSyncAt(), state.lastError())));
        } finally {
            lock.unlock();
        }
    }

    private void finish(String uid, T212SyncTracker.Run run, T212State.SyncState result, Instant succeededAt,
            T212State.Error error) {
        ReentrantLock lock = connection.lock(uid);
        lock.lock();
        try {
            if (run.cancelled().get()) {
                return;
            }
            states.find(uid).ifPresent(state -> states.save(uid, state.withSync(result, run.startedAt(),
                    succeededAt != null ? succeededAt : state.lastSyncAt(), error)));
        } finally {
            lock.unlock();
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isString() && !value.stringValue().isBlank() ? value.stringValue() : null;
    }

    private static <T> T firstNonNull(T a, T b) {
        return a != null ? a : b;
    }
}
