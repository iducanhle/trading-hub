package com.earningstracker.t212;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.earningstracker.fx.FxService;
import com.earningstracker.market.Logos;
import com.earningstracker.service.ProfileService;
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
    private final ProfileService profiles;
    private final FxService fx;
    private final Clock clock;

    public T212PortfolioService(T212ConnectionService connection, T212DataStore store, T212LiveService liveService,
            ProfileService profiles, FxService fx, Clock clock) {
        this.connection = connection;
        this.store = store;
        this.liveService = liveService;
        this.profiles = profiles;
        this.fx = fx;
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

        Map<String, T212Dtos.InstrumentRef> refs = refs(ctx, instruments, period.allTime());
        List<T212Dtos.InstrumentRef> ranked = refs.values().stream()
                .sorted(Comparator.comparingDouble(T212Dtos.InstrumentRef::totalPnl).reversed()).toList();
        T212Dtos.InstrumentRef best = ranked.isEmpty() ? null : ranked.getFirst();
        T212Dtos.InstrumentRef worst = ranked.size() < 2 ? null : ranked.getLast();

        return new T212Dtos.Summary(period.from(), period.to(), period.tz(), ctx.currency(),
                account == null ? null : account.totalValue(), account == null ? null : account.cash(),
                account == null ? null : account.invested(), account == null ? null : account.currentValue(),
                unrealized, round(realized), round(dividends), round(fees), round(interest), round(deposits),
                round(withdrawals), round(deposits - withdrawals), trades, round(totalPnl), includesUnrealized, pct,
                best, worst, connection.status(uid).syncState(), ctx.state().lastSyncAt(), ctx.asOf(), ctx.stale());
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

    public T212Dtos.TradePage trades(String uid, T212Period period, SideFilter side, String ticker, String cursor,
            int limit) {
        Context ctx = context(uid, false);
        Cursor after = Cursor.decode(cursor);
        T212PortfolioEngine.Result result = T212PortfolioEngine.compute(ctx.data(), null, T212Period.ALL_TIME);
        List<FillResult> matching = result.fills().values().stream()
                .filter(f -> period.contains(f.fill().executedAt()))
                .filter(f -> side == null || f.fill().side().name().equals(side.name()))
                .filter(f -> ticker == null || f.fill().ticker().equals(ticker))
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

    /** Logo URLs by ticker, for instruments with a mapped symbol (stored profile, else the ticker fallback). */
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
        symbols.forEach((ticker, symbol) -> logos.put(ticker, Logos.orFallback(symbol, stored.get(symbol))));
        return logos;
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
