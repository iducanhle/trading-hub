package com.earningstracker.t212;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.earningstracker.fx.FxService;
import com.earningstracker.market.Logos;
import com.earningstracker.service.ProfileService;
import com.earningstracker.service.QuoteService;
import com.earningstracker.t212.T212PortfolioEngine.FillResult;
import com.earningstracker.t212.T212PortfolioEngine.InstrumentResult;
import com.earningstracker.web.dto.T212Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.springframework.stereotype.Service;

/** The Trading 212 read endpoints: stored history plus live values, through {@link T212PortfolioEngine}. */
@Service
public class T212PortfolioService {

    public enum StatusFilter {
        OPEN, CLOSED, ALL
    }

    public enum SideFilter {
        BUY, SELL
    }

    private static final Comparator<T212Fill> NEWEST_FIRST = Comparator.comparing(T212Fill::executedAt)
            .thenComparing(T212Fill::id).reversed();
    private static final Set<String> INTEREST = Set.of("INTEREST_ON_FREE_CASH", "LENDING_INTEREST");

    private final T212ConnectionService connection;
    private final T212DataStore store;
    private final T212LiveService liveService;
    private final T212PieService pieService;
    private final ProfileService profiles;
    private final QuoteService quotes;
    private final FxService fx;
    private final T212SnapshotStore snapshots;
    private final Clock clock;

    public T212PortfolioService(T212ConnectionService connection, T212DataStore store, T212LiveService liveService,
            T212PieService pieService, ProfileService profiles, QuoteService quotes, FxService fx,
            T212SnapshotStore snapshots, Clock clock) {
        this.connection = connection;
        this.store = store;
        this.liveService = liveService;
        this.pieService = pieService;
        this.profiles = profiles;
        this.quotes = quotes;
        this.fx = fx;
        this.snapshots = snapshots;
        this.clock = clock;
    }

    /** What every response needs; {@code live} is null when not asked for or not available. */
    private record Context(T212State state, T212UserData data, T212Live live, Instant asOf, boolean stale) {

        Map<String, T212Live.Position> positions() {
            return live == null ? null : live.positions();
        }

        String currency() {
            if (state.accountCurrency() != null) {
                return state.accountCurrency();
            }
            return live != null && live.account().currency() != null ? live.account().currency() : null;
        }
    }

    private Context context(String uid, boolean withLive) {
        T212State state = connection.requireConnected(uid);
        T212UserData data = store.load(uid);
        T212Live live = withLive ? liveService.live(uid).orElse(null) : null;
        Instant asOf = Stream.of(state.lastSyncAt(), live == null ? null : live.fetchedAt()).filter(Objects::nonNull)
                .min(Comparator.naturalOrder()).orElse(clock.instant());
        boolean stale = state.syncState() == T212State.SyncState.FAILED || connection.credentialsUnusable(uid)
                || (withLive && (live == null || live.stale()));
        return new Context(state, data, live, asOf, stale);
    }

    public T212Dtos.Summary summary(String uid, T212Period period) {
        Context ctx = context(uid, true);
        T212PortfolioEngine.Result result = T212PortfolioEngine.compute(ctx.data(), ctx.positions(), period);
        List<InstrumentResult> instruments = T212PortfolioEngine.inPeriod(result, period);

        double realized = 0;
        double dividends = 0;
        double fees = 0;
        double totalBought = 0;
        int trades = 0;
        for (InstrumentResult instrument : result.instruments().values()) {
            realized += instrument.realizedPnl();
            dividends += instrument.dividends();
            fees += instrument.fees();
            trades += instrument.tradeCount();
            totalBought += instrument.totalBoughtAllTime();
        }
        CashTotals cash = cashTotals(ctx.data().transactions().values().stream()
                .filter(t -> period.contains(t.at())).toList(), ctx.currency());
        fees += cash.fees();
        double deposits = cash.deposits();
        double withdrawals = cash.withdrawals();
        double interest = cash.interest();

        T212Live.Account account = ctx.live() == null ? null : ctx.live().account();
        Double unrealized = account == null ? null : account.unrealizedPnl() != null ? account.unrealizedPnl()
                : ctx.live().positions().values().stream().map(T212Live.Position::unrealizedPnl)
                        .filter(Objects::nonNull).reduce(Double::sum).orElse(null);
        boolean includesUnrealized = period.allTime() && unrealized != null;
        double totalPnl = realized + dividends - fees + (includesUnrealized ? unrealized : 0);
        Double pct = period.allTime() && totalBought > 0 ? round(totalPnl / totalBought * 100) : null;
        Double totalValue = account == null ? null : account.totalValue();
        Double rateOfReturn = period.allTime() && totalValue != null
                ? rateOfReturn(ctx.data().transactions().values(), ctx.currency(), totalValue) : null;

        Map<String, T212Dtos.InstrumentRef> refs = refs(ctx, instruments, period.allTime());
        List<T212Dtos.InstrumentRef> ranked = refs.values().stream()
                .sorted(Comparator.comparingDouble(T212Dtos.InstrumentRef::totalPnl).reversed()).toList();
        T212Dtos.InstrumentRef best = ranked.isEmpty() ? null : ranked.getFirst();
        T212Dtos.InstrumentRef worst = ranked.size() < 2 ? null : ranked.getLast();

        return new T212Dtos.Summary(period.from(), period.to(), period.tz(), ctx.currency(),
                totalValue, account == null ? null : account.cash(),
                account == null ? null : account.invested(), account == null ? null : account.currentValue(),
                unrealized, round(realized), round(dividends), round(fees), round(interest), round(deposits),
                round(withdrawals), round(deposits - withdrawals), trades, round(totalPnl), includesUnrealized, pct,
                rateOfReturn, best, worst, connection.status(uid).syncState(), ctx.state().lastSyncAt(), ctx.asOf(), ctx.stale());
    }

    public T212Dtos.InstrumentList instruments(String uid, T212Period period, StatusFilter status) {
        Context ctx = context(uid, true);
        T212PortfolioEngine.Result result = T212PortfolioEngine.compute(ctx.data(), ctx.positions(), period);
        List<InstrumentResult> selected = T212PortfolioEngine.inPeriod(result, period).stream()
                .filter(i -> status == StatusFilter.ALL || (status == StatusFilter.OPEN) == i.open()).toList();
        Map<String, String> logos = logos(ctx, selected.stream().map(InstrumentResult::ticker).toList());
        List<T212Dtos.Instrument> items = selected.stream()
                .map(i -> instrument(ctx, i, period.allTime(), logos))
                .sorted(Comparator.comparingDouble(T212Dtos.Instrument::totalPnl).reversed()).toList();
        return new T212Dtos.InstrumentList(period.from(), period.to(), period.tz(), ctx.currency(), items,
                ctx.asOf(), ctx.stale());
    }

    /**
     * Open positions as Trading 212 lists them: each pie as one row with its instruments, and every position (or
     * the part of it outside pies) as another, largest value first. Outside pies the values come from the live
     * positions; inside a pie from the pie itself, falling back to the position's share where it has none.
     */
    public T212Dtos.HoldingList holdings(String uid) {
        Context ctx = context(uid, true);
        Map<String, T212Live.Position> live = ctx.positions() == null ? Map.of() : ctx.positions();
        boolean anyInPies = live.values().stream().anyMatch(p -> p.quantityInPies() > QUANTITY_EPSILON);
        List<T212PieService.Pie> pies = anyInPies ? pieService.pies(uid).orElse(null) : List.of();
        Set<String> tickers = new java.util.HashSet<>(live.keySet());
        if (pies != null) {
            pies.forEach(pie -> pie.items().forEach(item -> tickers.add(item.ticker())));
        }
        Map<String, String> logos = logos(ctx, List.copyOf(tickers));

        List<T212Dtos.Holding> items = new java.util.ArrayList<>();
        for (T212Live.Position position : live.values()) {
            double outside = position.quantity() - position.quantityInPies();
            if (outside > QUANTITY_EPSILON) {
                items.add(new T212Dtos.Holding("POSITION", null, share(ctx, position, outside, logos)));
            }
        }
        if (pies != null) {
            for (T212PieService.Pie pie : pies) {
                List<T212Dtos.HoldingPosition> rows = pie.items().stream()
                        .map(item -> pieItem(ctx, item, live.get(item.ticker()), logos)).sorted(BY_VALUE).toList();
                T212PieService.Result r = pie.result();
                Double value = r.value() != null ? round(r.value()) : sum(rows, T212Dtos.HoldingPosition::value);
                Double pnl = r.pnl() != null ? round(r.pnl()) : sum(rows, T212Dtos.HoldingPosition::pnl);
                Double pct = r.pnlCoef() != null ? round(r.pnlCoef() * 100) : percent(pnl, value);
                items.add(new T212Dtos.Holding("PIE", new T212Dtos.Pie(pie.id(), pie.name(), value, pnl, pct, rows),
                        null));
            }
        } else {
            List<T212Dtos.HoldingPosition> rows = live.values().stream()
                    .filter(p -> p.quantityInPies() > QUANTITY_EPSILON)
                    .map(p -> share(ctx, p, p.quantityInPies(), logos)).sorted(BY_VALUE).toList();
            Double value = sum(rows, T212Dtos.HoldingPosition::value);
            Double pnl = sum(rows, T212Dtos.HoldingPosition::pnl);
            items.add(new T212Dtos.Holding("PIE", new T212Dtos.Pie(null, null, value, pnl, percent(pnl, value), rows),
                    null));
        }
        items.sort(Comparator.comparing(T212PortfolioService::holdingValue,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return new T212Dtos.HoldingList(ctx.currency(), items, pies != null, ctx.asOf(), ctx.stale());
    }

    /** How many of the largest positions get today's price change (one quote each, cached for 60 s). */
    static final int QUOTED_POSITIONS = 24;

    /**
     * Open positions as shares of their total value, largest first, each instrument once (inside and outside pies
     * together). Live positions only, no quotes: today's change comes from {@link #dayChanges(String)}.
     */
    public T212Dtos.Allocation allocation(String uid) {
        Context ctx = context(uid, true);
        List<T212Live.Position> held = held(ctx);
        double total = held.stream().mapToDouble(T212Live.Position::value).sum();
        Map<String, String> logos = logos(ctx, held.stream().map(T212Live.Position::ticker).toList());
        List<T212Dtos.AllocationItem> items = held.stream().map(p -> {
            T212InstrumentInfo info = info(ctx, p.ticker());
            return new T212Dtos.AllocationItem(p.ticker(), info.symbol(), name(info), logos.get(p.ticker()),
                    round(p.value()), round(p.value() / total * 100));
        }).toList();
        return new T212Dtos.Allocation(ctx.currency(), round(total), items, ctx.asOf(), ctx.stale());
    }

    /** One step of {@link #history}: the last point of each 5, 15 or 30 minutes, hour, 4 hours, day or week. */
    public enum HistoryInterval {
        M5("5m", 5), M15("15m", 15), M30("30m", 30), H1("1h", 60), H4("4h", 240), D1("1d", 1440), W1("1w", 0);

        private final String code;
        private final int minutes;

        HistoryInterval(String code, int minutes) {
            this.code = code;
            this.minutes = minutes;
        }

        public String code() {
            return code;
        }

        public static Optional<HistoryInterval> parse(String code) {
            return Arrays.stream(values()).filter(i -> i.code.equalsIgnoreCase(code)).findFirst();
        }

        /** The start of the step containing {@code at}, in Europe/Prague time (weeks start on Monday). */
        Instant bucket(Instant at) {
            ZonedDateTime local = at.atZone(T212SnapshotStore.ZONE);
            ZonedDateTime day = local.truncatedTo(ChronoUnit.DAYS);
            if (this == W1) {
                return day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toInstant();
            }
            int minuteOfDay = local.getHour() * 60 + local.getMinute();
            return day.plusMinutes(minuteOfDay / minutes * minutes).toInstant();
        }
    }

    /** How far back {@link #history} reaches, the intervals it offers (keeping the points to a few thousand). */
    public enum HistoryRange {
        D1("1D", Duration.ofDays(1), HistoryInterval.M15, HistoryInterval.M5, HistoryInterval.M30,
                HistoryInterval.H1),
        W1("1W", Duration.ofDays(7), HistoryInterval.H1, HistoryInterval.M5, HistoryInterval.M15,
                HistoryInterval.M30, HistoryInterval.H4),
        M1("1M", Duration.ofDays(31), HistoryInterval.H1, HistoryInterval.M15, HistoryInterval.M30,
                HistoryInterval.H4, HistoryInterval.D1),
        M3("3M", Duration.ofDays(92), HistoryInterval.H4, HistoryInterval.M30, HistoryInterval.H1,
                HistoryInterval.D1),
        Y1("1Y", Duration.ofDays(366), HistoryInterval.D1, HistoryInterval.H1, HistoryInterval.H4,
                HistoryInterval.W1),
        ALL("ALL", null, HistoryInterval.D1, HistoryInterval.H1, HistoryInterval.H4, HistoryInterval.W1);

        private final String code;
        private final Duration span;
        private final HistoryInterval defaultInterval;
        private final Set<HistoryInterval> intervals;

        HistoryRange(String code, Duration span, HistoryInterval defaultInterval, HistoryInterval... others) {
            this.code = code;
            this.span = span;
            this.defaultInterval = defaultInterval;
            this.intervals = java.util.EnumSet.of(defaultInterval, others);
        }

        public String code() {
            return code;
        }

        public HistoryInterval defaultInterval() {
            return defaultInterval;
        }

        public boolean offers(HistoryInterval interval) {
            return intervals.contains(interval);
        }

        public static Optional<HistoryRange> parse(String code) {
            return Arrays.stream(values()).filter(r -> r.code.equalsIgnoreCase(code)).findFirst();
        }
    }

    /**
     * The stored account values ({@link T212SnapshotStore}) of the range, the last of each interval, oldest first,
     * each with the net deposits up to then. Never calls Trading 212.
     */
    public T212Dtos.History history(String uid, HistoryRange range, HistoryInterval interval) {
        Context ctx = context(uid, false);
        Instant now = clock.instant();
        Map<Instant, T212SnapshotStore.Point> lastPerStep = new java.util.TreeMap<>();
        for (T212SnapshotStore.Point p : snapshots.points(uid)) {
            if (range.span == null || !p.at().isBefore(now.minus(range.span))) {
                lastPerStep.put(interval.bucket(p.at()), p);
            }
        }
        List<T212SnapshotStore.Point> points = List.copyOf(lastPerStep.values());

        List<T212CashTransaction> flows = ctx.data().transactions().values().stream()
                .filter(t -> t.type().equals("DEPOSIT") || t.type().equals("WITHDRAW"))
                .sorted(Comparator.comparing(T212CashTransaction::at)).toList();
        List<T212Dtos.HistoryPoint> result = new java.util.ArrayList<>();
        int next = 0;
        Double netDeposits = 0.0;
        for (T212SnapshotStore.Point p : points) {
            while (next < flows.size() && !flows.get(next).at().isAfter(p.at())) {
                T212CashTransaction t = flows.get(next++);
                Double amount = inAccountCurrency(t.amount(), t.currency(), ctx.currency());
                netDeposits = netDeposits == null || amount == null ? null : netDeposits + amount;
            }
            result.add(new T212Dtos.HistoryPoint(p.at(), round(p.value()),
                    netDeposits == null ? null : round(netDeposits),
                    netDeposits == null ? null : round(p.value() - netDeposits)));
        }
        return new T212Dtos.History(range.code(), interval.code(), ctx.currency(), result, ctx.asOf(), ctx.stale());
    }

    /**
     * Today's price change of the {@link #QUOTED_POSITIONS} largest open positions by Trading 212 ticker, from the
     * quote of their mapped symbol; unmapped instruments and failed quotes are left out. Slow while the quotes are
     * not cached (Finnhub allows about one call a second), which is why it is separate from {@link #allocation}.
     */
    public T212Dtos.DayChanges dayChanges(String uid) {
        Context ctx = context(uid, true);
        Map<String, String> symbols = new java.util.LinkedHashMap<>();
        for (T212Live.Position position : held(ctx).stream().limit(QUOTED_POSITIONS).toList()) {
            String symbol = info(ctx, position.ticker()).symbol();
            if (symbol != null) {
                symbols.put(position.ticker(), symbol);
            }
        }
        Map<String, Double> bySymbol = quoteChanges(symbols.values().stream().distinct().toList());
        Map<String, Double> changes = new java.util.LinkedHashMap<>();
        symbols.forEach((ticker, symbol) -> {
            Double change = bySymbol.get(symbol);
            if (change != null) {
                changes.put(ticker, change);
            }
        });
        return new T212Dtos.DayChanges(changes, ctx.asOf(), ctx.stale());
    }

    /** Live positions with a value, largest first. */
    private static List<T212Live.Position> held(Context ctx) {
        Map<String, T212Live.Position> live = ctx.positions() == null ? Map.of() : ctx.positions();
        return live.values().stream().filter(p -> p.value() != null && p.value() > 0)
                .sorted(Comparator.comparingDouble(T212Live.Position::value).reversed()).toList();
    }

    /** Today's price change in percent by symbol, quotes fetched in parallel; a failed quote is left out. */
    private Map<String, Double> quoteChanges(List<String> symbols) {
        Map<String, Double> changes = new java.util.concurrent.ConcurrentHashMap<>();
        try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            for (String symbol : symbols) {
                executor.submit(() -> {
                    try {
                        changes.put(symbol, round(quotes.quote(symbol).value().changePercent()));
                    } catch (RuntimeException e) {
                        // no change for this one
                    }
                });
            }
        }
        return changes;
    }

    public T212Dtos.InstrumentDetail instrument(String uid, String ticker) {
        Context ctx = context(uid, true);
        T212PortfolioEngine.Result result = T212PortfolioEngine.compute(ctx.data(), ctx.positions(),
                T212Period.ALL_TIME);
        InstrumentResult instrument = result.instruments().get(ticker);
        if (instrument == null) {
            throw new ApiException(ErrorCode.NOT_FOUND, "No trades, dividends or position for " + ticker);
        }
        Map<String, String> logos = logos(ctx, List.of(ticker));
        List<T212Dtos.DetailTrade> trades = result.fills().values().stream()
                .filter(f -> f.fill().ticker().equals(ticker))
                .sorted(Comparator.comparing(FillResult::fill, NEWEST_FIRST))
                .map(f -> detailTrade(ctx, f)).toList();
        List<T212Dtos.Dividend> dividends = ctx.data().dividends().values().stream()
                .filter(d -> d.ticker().equals(ticker))
                .sorted(Comparator.comparing(T212DividendPayment::paidAt).thenComparing(T212DividendPayment::id)
                        .reversed())
                .map(d -> dividend(ctx, d)).toList();
        return new T212Dtos.InstrumentDetail(ctx.currency(), instrument(ctx, instrument, true, logos), trades,
                dividends, ctx.asOf(), ctx.stale());
    }

    public T212Dtos.TradePage trades(String uid, T212Period period, SideFilter side, Set<String> tickers, String cursor,
            int limit) {
        Context ctx = context(uid, false);
        Cursor after = Cursor.decode(cursor);
        T212PortfolioEngine.Result result = T212PortfolioEngine.compute(ctx.data(), null, T212Period.ALL_TIME);
        List<FillResult> matching = result.fills().values().stream()
                .filter(f -> period.contains(f.fill().executedAt()))
                .filter(f -> side == null || f.fill().side().name().equals(side.name()))
                .filter(f -> tickers.isEmpty() || tickers.contains(f.fill().ticker()))
                .sorted(Comparator.comparing(FillResult::fill, NEWEST_FIRST))
                .filter(f -> after == null || after.isBefore(f.fill()))
                .limit(limit + 1L).toList();
        List<FillResult> page = matching.size() > limit ? matching.subList(0, limit) : matching;
        String next = matching.size() > limit ? Cursor.of(page.getLast().fill()).encode() : null;
        return new T212Dtos.TradePage(page.stream().map(f -> trade(ctx, f)).toList(), next, ctx.currency(),
                ctx.asOf(), ctx.stale());
    }

    public T212Dtos.DividendList dividends(String uid, T212Period period, String ticker) {
        Context ctx = context(uid, false);
        List<T212Dtos.Dividend> items = ctx.data().dividends().values().stream()
                .filter(d -> period.contains(d.paidAt()))
                .filter(d -> ticker == null || d.ticker().equals(ticker))
                .sorted(Comparator.comparing(T212DividendPayment::paidAt).thenComparing(T212DividendPayment::id)
                        .reversed())
                .map(d -> dividend(ctx, d)).toList();
        double total = items.stream().mapToDouble(T212Dtos.Dividend::amount).sum();
        return new T212Dtos.DividendList(period.from(), period.to(), period.tz(), ctx.currency(), round(total), items,
                ctx.asOf(), ctx.stale());
    }

    public T212Dtos.TransactionList transactions(String uid, T212Period period, String type) {
        Context ctx = context(uid, false);
        List<T212CashTransaction> inPeriod = ctx.data().transactions().values().stream()
                .filter(t -> period.contains(t.at()))
                .sorted(Comparator.comparing(T212CashTransaction::at).thenComparing(T212CashTransaction::id)
                        .reversed())
                .toList();
        CashTotals cash = cashTotals(inPeriod, ctx.currency());
        List<T212Dtos.Transaction> items = inPeriod.stream().filter(t -> type == null || t.type().equals(type))
                .map(t -> new T212Dtos.Transaction(t.id(), t.at(), t.type(), t.amount(), t.currency())).toList();
        return new T212Dtos.TransactionList(period.from(), period.to(), period.tz(), ctx.currency(),
                new T212Dtos.TransactionTotals(round(cash.deposits()), round(cash.withdrawals()), round(cash.fees()),
                        round(cash.interest())),
                items, ctx.asOf(), ctx.stale());
    }

    // ---- mapping ----

    private static final double QUANTITY_EPSILON = 1e-9;
    private static final Comparator<T212Dtos.HoldingPosition> BY_VALUE = Comparator.comparing(
            T212Dtos.HoldingPosition::value, Comparator.nullsLast(Comparator.reverseOrder()));

    /** {@code quantity} of a live position, with its value and unrealized result taken pro rata. */
    private static T212Dtos.HoldingPosition share(Context ctx, T212Live.Position position, double quantity,
            Map<String, String> logos) {
        double part = position.quantity() > 0 ? quantity / position.quantity() : 0;
        Double value = position.value() == null ? null : round(position.value() * part);
        Double pnl = position.unrealizedPnl() == null ? null : round(position.unrealizedPnl() * part);
        Double pct = position.unrealizedPnl() != null && position.cost() != null && position.cost() > 0
                ? round(position.unrealizedPnl() / position.cost() * 100) : null;
        T212InstrumentInfo info = info(ctx, position.ticker());
        return new T212Dtos.HoldingPosition(position.ticker(), info.symbol(), name(info), logos.get(position.ticker()),
                quantity, value, pnl, pct);
    }

    private static T212Dtos.HoldingPosition pieItem(Context ctx, T212PieService.Item item, T212Live.Position live,
            Map<String, String> logos) {
        T212PieService.Result r = item.result();
        T212Dtos.HoldingPosition fallback = live == null ? null : share(ctx, live, item.ownedQuantity(), logos);
        Double value = r.value() != null ? round(r.value()) : fallback == null ? null : fallback.value();
        Double pnl = r.pnl() != null ? round(r.pnl()) : fallback == null ? null : fallback.pnl();
        Double pct = r.pnlCoef() != null ? round(r.pnlCoef() * 100) : fallback == null ? null : fallback.pnlPct();
        T212InstrumentInfo info = info(ctx, item.ticker());
        return new T212Dtos.HoldingPosition(item.ticker(), info.symbol(), name(info), logos.get(item.ticker()),
                item.ownedQuantity(), value, pnl, pct);
    }

    private static Double holdingValue(T212Dtos.Holding holding) {
        return holding.pie() != null ? holding.pie().value() : holding.position().value();
    }

    private static Double sum(List<T212Dtos.HoldingPosition> rows,
            java.util.function.Function<T212Dtos.HoldingPosition, Double> field) {
        return rows.stream().map(field).filter(Objects::nonNull).reduce(Double::sum).map(T212PortfolioService::round)
                .orElse(null);
    }

    /** The result as a percentage of the cost (value − result); null when either is missing. */
    private static Double percent(Double pnl, Double value) {
        if (pnl == null || value == null || value - pnl <= 0) {
            return null;
        }
        return round(pnl / (value - pnl) * 100);
    }

    private static Double round(Double value) {
        return value == null ? null : round(value.doubleValue());
    }

    private T212Dtos.Instrument instrument(Context ctx, InstrumentResult i, boolean allTime,
            Map<String, String> logos) {
        T212InstrumentInfo info = info(ctx, i.ticker());
        T212Live.Position live = i.live();
        double total = i.totalPnl(allTime);
        Double pct = allTime && i.totalBoughtAllTime() > 0 ? round(total / i.totalBoughtAllTime() * 100) : null;
        String currency = info.currency() != null ? info.priceCurrency()
                : live != null ? live.priceCurrency() : null;
        return new T212Dtos.Instrument(i.ticker(), info.symbol(), name(info), info.isin(), logos.get(i.ticker()),
                currency, i.open() ? "OPEN" : "CLOSED", i.heldQuantity(),
                live == null ? null : live.averagePrice(), live == null ? null : live.currentPrice(),
                live == null ? null : live.value(), live == null ? null : live.cost(),
                new T212Dtos.Amounts(i.boughtQuantity(), round(i.boughtValue())),
                new T212Dtos.Amounts(i.soldQuantity(), round(i.soldValue())), i.realizedPnl(), i.dividends(),
                i.fees(), i.unrealizedPnl(), round(total), pct, i.tradeCount(), i.firstTradeAt(), i.lastTradeAt());
    }

    private Map<String, T212Dtos.InstrumentRef> refs(Context ctx, List<InstrumentResult> instruments,
            boolean allTime) {
        Map<String, String> logos = logos(ctx, instruments.stream().map(InstrumentResult::ticker).toList());
        return instruments.stream().collect(Collectors.toMap(InstrumentResult::ticker, i -> {
            T212InstrumentInfo info = info(ctx, i.ticker());
            return new T212Dtos.InstrumentRef(i.ticker(), info.symbol(), name(info), logos.get(i.ticker()),
                    round(i.totalPnl(allTime)));
        }, (a, b) -> a, java.util.LinkedHashMap::new));
    }

    private T212Dtos.Trade trade(Context ctx, FillResult f) {
        T212Fill fill = f.fill();
        T212InstrumentInfo info = info(ctx, fill.ticker());
        return new T212Dtos.Trade(fill.id(), fill.executedAt(), fill.ticker(), info.symbol(), name(info),
                fill.side().name(), fill.kind(), fill.quantity(), fill.price(), fill.priceCurrency(), fill.value(),
                fill.fees(), fill.taxes(), fill.fxRate(), f.realizedPnl() == null ? null : round(f.realizedPnl()),
                fill.orderType());
    }

    private T212Dtos.DetailTrade detailTrade(Context ctx, FillResult f) {
        T212Dtos.Trade t = trade(ctx, f);
        return new T212Dtos.DetailTrade(t.id(), t.executedAt(), t.t212Ticker(), t.symbol(), t.name(), t.side(),
                t.kind(), t.quantity(), t.price(), t.priceCurrency(), t.value(), t.fees(), t.taxes(), t.fxRate(),
                t.realizedPnl(), t.orderType(), f.positionAfter());
    }

    private T212Dtos.Dividend dividend(Context ctx, T212DividendPayment d) {
        T212InstrumentInfo info = info(ctx, d.ticker());
        return new T212Dtos.Dividend(d.id(), d.paidAt(), d.ticker(), info.symbol(), name(info), d.quantity(),
                d.amount(), d.grossPerShare(), d.grossPerShareCurrency(), d.type());
    }

    /** Stored instrument data, else what the live position says, else the ticker alone. */
    private static T212InstrumentInfo info(Context ctx, String ticker) {
        T212InstrumentInfo stored = ctx.data().instruments().get(ticker);
        if (stored != null) {
            return stored;
        }
        T212Live.Position live = ctx.positions() == null ? null : ctx.positions().get(ticker);
        if (live != null) {
            return new T212InstrumentInfo(ticker, live.name(), live.isin(), live.currency(),
                    T212SymbolMapper.map(ticker, live.currency()));
        }
        return new T212InstrumentInfo(ticker, null, null, null, T212SymbolMapper.map(ticker, null));
    }

    private static String name(T212InstrumentInfo info) {
        return info.name() != null ? info.name() : info.ticker();
    }

    /** Logo URLs by ticker, for instruments with a mapped symbol (stored profile, else the ticker's Parqet logo). */
    private Map<String, String> logos(Context ctx, List<String> tickers) {
        Map<String, String> symbols = new java.util.HashMap<>();
        for (String ticker : tickers) {
            String symbol = info(ctx, ticker).symbol();
            if (symbol != null) {
                symbols.put(ticker, symbol);
            }
        }
        Map<String, String> stored = symbols.isEmpty() ? Map.of() : profiles.logos(symbols.values());
        Map<String, String> logos = new java.util.HashMap<>();
        symbols.forEach((ticker, symbol) -> logos.put(ticker, Logos.orParqet(symbol, stored.get(symbol))));
        return logos;
    }

    /** The money-weighted rate of return in percent, over every deposit and withdrawal; see {@link T212RateOfReturn}. */
    private Double rateOfReturn(java.util.Collection<T212CashTransaction> transactions, String accountCurrency,
            double totalValue) {
        List<T212RateOfReturn.Flow> flows = new java.util.ArrayList<>();
        for (T212CashTransaction t : transactions) {
            if (!t.type().equals("DEPOSIT") && !t.type().equals("WITHDRAW")) {
                continue;
            }
            Double amount = inAccountCurrency(t.amount(), t.currency(), accountCurrency);
            if (amount != null) {
                flows.add(new T212RateOfReturn.Flow(t.at(), amount));
            }
        }
        Double rate = T212RateOfReturn.compute(flows, totalValue, clock.instant());
        return rate == null ? null : round(rate * 100);
    }

    /** Deposits, withdrawals and fees as positive amounts, interest signed; all in the account currency. */
    private record CashTotals(double deposits, double withdrawals, double fees, double interest) {
    }

    /**
     * Totals in the account currency. A transaction in another currency (a USD deposit into a CZK account) is
     * converted at today's rate, so its total is approximate; without a rate it is left out of the totals.
     */
    private CashTotals cashTotals(List<T212CashTransaction> transactions, String accountCurrency) {
        double deposits = 0;
        double withdrawals = 0;
        double fees = 0;
        double interest = 0;
        for (T212CashTransaction t : transactions) {
            Double amount = inAccountCurrency(t.amount(), t.currency(), accountCurrency);
            if (amount == null) {
                continue;
            }
            switch (t.type()) {
                case "DEPOSIT" -> deposits += amount;
                case "WITHDRAW" -> withdrawals -= amount;
                case "FEE" -> fees -= amount; // fees are negative; a refund is positive and lowers the total
                default -> {
                    if (INTEREST.contains(t.type())) {
                        interest += amount;
                    }
                }
            }
        }
        return new CashTotals(deposits, withdrawals, fees, interest);
    }

    private Double inAccountCurrency(double amount, String currency, String accountCurrency) {
        if (currency == null || accountCurrency == null || currency.equalsIgnoreCase(accountCurrency)) {
            return amount;
        }
        Double usd = fx.toUsd(amount, currency);
        Double usdPerUnit = fx.toUsd(1.0, accountCurrency);
        return usd == null || usdPerUnit == null || usdPerUnit == 0 ? null : usd / usdPerUnit;
    }

    private static double round(double value) {
        return Math.round(value * 100) / 100.0;
    }

    /** Opaque trade cursor: the last item's time and id, base64url. */
    record Cursor(long epochMillis, String id) {

        static Cursor of(T212Fill fill) {
            return new Cursor(fill.executedAt().toEpochMilli(), fill.id());
        }

        String encode() {
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString((epochMillis + "|" + id).getBytes(StandardCharsets.UTF_8));
        }

        static Cursor decode(String cursor) {
            if (cursor == null || cursor.isBlank()) {
                return null;
            }
            try {
                String text = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
                int bar = text.indexOf('|');
                return new Cursor(Long.parseLong(text.substring(0, bar)), text.substring(bar + 1));
            } catch (IllegalArgumentException | IndexOutOfBoundsException e) {
                throw new ApiException(ErrorCode.BAD_REQUEST, "invalid cursor");
            }
        }

        /** True if {@code fill} comes after this cursor in newest-first order. */
        boolean isBefore(T212Fill fill) {
            long at = fill.executedAt().toEpochMilli();
            return at < epochMillis || (at == epochMillis && fill.id().compareTo(id) < 0);
        }
    }
}
