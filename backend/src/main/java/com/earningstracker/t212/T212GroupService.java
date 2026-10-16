package com.earningstracker.t212;

import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import com.earningstracker.t212.T212GroupEngine.GroupResult;
import com.earningstracker.t212.T212GroupStore.Group;
import com.earningstracker.t212.T212PortfolioEngine.FillResult;
import com.earningstracker.t212.T212PortfolioService.Context;
import com.earningstracker.web.dto.T212Dtos;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.springframework.stereotype.Service;

/**
 * The user's groups (docs/CONTRACT.md, "Groups"): their own pies, built from the trades they assign. Figures come
 * from {@link T212GroupEngine}; live values per share from the cached live positions.
 */
@Service
public class T212GroupService {

    static final int MAX_GROUPS = 30;
    static final int MAX_NAME_LENGTH = 40;
    static final int MAX_ASSIGN = 500;
    private static final double EPSILON = T212PortfolioEngine.EPSILON;

    private static final Comparator<T212Dtos.GroupHolding> HOLDINGS_ORDER = Comparator
            .comparing(T212Dtos.GroupHolding::value, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(T212Dtos.GroupHolding::invested, Comparator.reverseOrder());

    private final T212PortfolioService portfolio;
    private final T212ConnectionService connection;
    private final T212GroupStore store;
    private final Clock clock;

    public T212GroupService(T212PortfolioService portfolio, T212ConnectionService connection, T212GroupStore store,
            Clock clock) {
        this.portfolio = portfolio;
        this.connection = connection;
        this.store = store;
        this.clock = clock;
    }

    /** Every group, largest value first, and the shares in no group. */
    public T212Dtos.GroupList list(String uid) {
        Context ctx = portfolio.context(uid, true);
        List<Group> groups = store.load(uid);
        T212GroupEngine.Result result = compute(ctx, groups);
        Map<String, String> logos = portfolio.logos(ctx, tickers(ctx, result));
        List<T212Dtos.Group> items = groups.stream()
                .map(g -> group(ctx, g, result, logos))
                .sorted(Comparator.comparing(T212Dtos.Group::value, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(T212Dtos.Group::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return new T212Dtos.GroupList(ctx.currency(), items, ungrouped(ctx, result, logos), ctx.asOf(),
                ctx.stale());
    }

    /** One group with its trades, newest first. */
    public T212Dtos.GroupDetail detail(String uid, String id) {
        Context ctx = portfolio.context(uid, true);
        List<Group> groups = store.load(uid);
        Group group = find(groups, id);
        T212GroupEngine.Result result = compute(ctx, groups);
        GroupResult figures = result.groups().get(id);
        Set<String> tickers = new HashSet<>(figures.lots().keySet());
        Set<String> ids = new HashSet<>(group.trades());
        T212PortfolioEngine.Result engine = T212PortfolioEngine.compute(ctx.data(), null, T212Period.ALL_TIME);
        List<FillResult> fills = engine.fills().values().stream().filter(f -> ids.contains(f.fill().id()))
                .sorted(Comparator.comparing((FillResult f) -> f.fill().executedAt())
                        .thenComparing(f -> f.fill().id()).reversed())
                .toList();
        fills.forEach(f -> tickers.add(f.fill().ticker()));
        Map<String, String> logos = portfolio.logos(ctx, List.copyOf(tickers));
        Set<String> oversold = new HashSet<>();
        result.oversells().forEach(o -> oversold.add(o.fillId()));
        List<T212Dtos.GroupTrade> trades = fills.stream().map(f -> {
            T212Dtos.Trade t = portfolio.trade(ctx, f);
            return new T212Dtos.GroupTrade(t.id(), t.executedAt(), t.t212Ticker(), t.symbol(), t.name(), t.side(),
                    t.kind(), t.quantity(), t.price(), t.priceCurrency(), t.value(), t.fees(), t.taxes(), t.fxRate(),
                    t.realizedPnl(), t.orderType(), t.original(), id, result.groupRealized().get(t.id()),
                    oversold.contains(t.id()));
        }).toList();
        return new T212Dtos.GroupDetail(ctx.currency(), group(ctx, group, result, logos), trades, ctx.asOf(),
                ctx.stale());
    }

    public T212Dtos.Group create(String uid, String name) {
        connection.requireConnected(uid);
        String clean = validName(name);
        String id = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        store.update(uid, groups -> {
            if (groups.size() >= MAX_GROUPS) {
                throw new ApiException(ErrorCode.BAD_REQUEST, "at most " + MAX_GROUPS + " groups");
            }
            List<Group> updated = new ArrayList<>(groups);
            updated.add(new Group(id, clean, clock.instant(), List.of()));
            return updated;
        });
        return single(uid, id);
    }

    public T212Dtos.Group rename(String uid, String id, String name) {
        connection.requireConnected(uid);
        String clean = validName(name);
        store.update(uid, groups -> {
            find(groups, id);
            return groups.stream().map(g -> g.id().equals(id) ? g.withName(clean) : g).toList();
        });
        return single(uid, id);
    }

    /** Deletes the group; its trades are then in no group. */
    public void delete(String uid, String id) {
        connection.requireConnected(uid);
        store.update(uid, groups -> {
            find(groups, id);
            return groups.stream().filter(g -> !g.id().equals(id)).toList();
        });
    }

    /**
     * Moves the trades into the group ({@code groupId} null: out of any group). A group may then sell more shares
     * than it holds (its buys are not assigned yet); the group reports that in {@code oversold}.
     */
    public void assign(String uid, List<String> tradeIds, String groupId) {
        Context ctx = portfolio.context(uid, false);
        if (tradeIds == null) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "tradeIds is required");
        }
        if (tradeIds.size() > MAX_ASSIGN) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "at most " + MAX_ASSIGN + " trades per call");
        }
        Set<String> ids = new LinkedHashSet<>();
        for (String tradeId : tradeIds) {
            T212Fill fill = tradeId == null ? null : ctx.data().fills().get(tradeId);
            if (fill == null) {
                throw new ApiException(ErrorCode.BAD_REQUEST, "unknown trade " + tradeId);
            }
            if (!T212Fill.TRADE.equals(fill.kind())) {
                throw new ApiException(ErrorCode.BAD_REQUEST, "only buys and sells can be in a group");
            }
            ids.add(tradeId);
        }
        store.update(uid, groups -> {
            if (groupId != null) {
                find(groups, groupId);
            }
            List<Group> updated = new ArrayList<>();
            for (Group group : groups) {
                List<String> trades = new ArrayList<>(group.trades().stream().filter(t -> !ids.contains(t)).toList());
                if (group.id().equals(groupId)) {
                    trades.addAll(ids);
                }
                updated.add(group.withTrades(trades));
            }
            return updated;
        });
    }

    // ---- figures ----

    private T212Dtos.Group single(String uid, String id) {
        Context ctx = portfolio.context(uid, true);
        List<Group> groups = store.load(uid);
        Group group = find(groups, id);
        T212GroupEngine.Result result = compute(ctx, groups);
        GroupResult figures = result.groups().get(id);
        return group(ctx, group, result, portfolio.logos(ctx, List.copyOf(figures.lots().keySet())));
    }

    private static T212GroupEngine.Result compute(Context ctx, List<Group> groups) {
        Map<String, String> groupOf = new HashMap<>();
        groups.forEach(g -> g.trades().forEach(t -> groupOf.put(t, g.id())));
        return T212GroupEngine.compute(ctx.data().fills().values(), groupOf, groups.stream().map(Group::id).toList());
    }

    private static T212Dtos.Group group(Context ctx, Group group, T212GroupEngine.Result result,
            Map<String, String> logos) {
        GroupResult figures = result.groups().get(group.id());
        Map<String, Double> missing = new LinkedHashMap<>();
        result.oversells().stream().filter(o -> o.groupId().equals(group.id()))
                .forEach(o -> missing.merge(o.ticker(), o.missing(), Double::sum));
        List<T212Dtos.OversoldStock> oversold = missing.entrySet().stream().map(e -> {
            T212InstrumentInfo info = T212PortfolioService.info(ctx, e.getKey());
            return new T212Dtos.OversoldStock(e.getKey(), info.symbol(), T212PortfolioService.name(info),
                    e.getValue());
        }).toList();
        List<T212Dtos.GroupHolding> holdings = figures.lots().entrySet().stream()
                .map(e -> holding(ctx, e.getKey(), e.getValue().quantity(), e.getValue().cost(), logos))
                .sorted(HOLDINGS_ORDER).toList();
        double invested = holdings.stream().mapToDouble(T212Dtos.GroupHolding::invested).sum();
        Double value;
        Double unrealized;
        if (holdings.isEmpty()) {
            value = 0.0;
            unrealized = 0.0;
        } else if (ctx.positions() == null) {
            value = null;
            unrealized = null;
        } else {
            value = holdings.stream().map(T212Dtos.GroupHolding::value).filter(Objects::nonNull)
                    .mapToDouble(Double::doubleValue).sum();
            unrealized = holdings.stream().map(T212Dtos.GroupHolding::unrealizedPnl).filter(Objects::nonNull)
                    .mapToDouble(Double::doubleValue).sum();
        }
        double total = figures.realizedPnl() - figures.fees() + (unrealized == null ? 0 : unrealized);
        Double pct = figures.bought() > 0 ? round(total / figures.bought() * 100) : null;
        return new T212Dtos.Group(group.id(), group.name(), group.createdAt(), figures.tradeCount(),
                round(figures.bought()), round(figures.sold()), round(invested), round(value),
                round(figures.realizedPnl()), round(figures.fees()), round(unrealized), round(total), pct, holdings,
                oversold);
    }

    /** {@code quantity} shares of {@code ticker} that cost {@code cost}, valued at the live value per share. */
    private static T212Dtos.GroupHolding holding(Context ctx, String ticker, double quantity, double cost,
            Map<String, String> logos) {
        T212Live.Position live = ctx.positions() == null ? null : ctx.positions().get(ticker);
        Double value = live == null || live.value() == null || live.quantity() <= EPSILON ? null
                : live.value() / live.quantity() * quantity;
        Double unrealized = value == null ? null : value - cost;
        Double pct = unrealized == null || cost <= 0 ? null : round(unrealized / cost * 100);
        T212InstrumentInfo info = T212PortfolioService.info(ctx, ticker);
        return new T212Dtos.GroupHolding(ticker, info.symbol(), T212PortfolioService.name(info), logos.get(ticker),
                quantity, round(cost), round(value), round(unrealized), pct);
    }

    /** Per open position, the shares in no group, at the position's own average cost. */
    private static T212Dtos.Ungrouped ungrouped(Context ctx, T212GroupEngine.Result result,
            Map<String, String> logos) {
        if (ctx.positions() == null) {
            return new T212Dtos.Ungrouped(null, List.of());
        }
        Map<String, Double> grouped = new HashMap<>();
        for (GroupResult group : result.groups().values()) {
            group.lots().forEach((ticker, lot) -> grouped.merge(ticker, lot.quantity(), Double::sum));
        }
        List<T212Dtos.GroupHolding> holdings = new ArrayList<>();
        for (T212Live.Position position : ctx.positions().values()) {
            double rest = position.quantity() - grouped.getOrDefault(position.ticker(), 0.0);
            if (position.quantity() <= EPSILON || rest <= position.quantity() * 1e-6) {
                continue;
            }
            double part = rest / position.quantity();
            Double value = position.value() == null ? null : position.value() * part;
            Double cost = position.cost() != null ? (Double) (position.cost() * part)
                    : value != null && position.unrealizedPnl() != null ? value - position.unrealizedPnl() * part
                    : null;
            Double unrealized = value == null || cost == null ? null : value - cost;
            Double pct = unrealized == null || cost <= 0 ? null : round(unrealized / cost * 100);
            T212InstrumentInfo info = T212PortfolioService.info(ctx, position.ticker());
            holdings.add(new T212Dtos.GroupHolding(position.ticker(), info.symbol(), T212PortfolioService.name(info),
                    logos.get(position.ticker()), rest, round(cost == null ? 0 : cost), round(value),
                    round(unrealized), pct));
        }
        holdings.sort(HOLDINGS_ORDER);
        double value = holdings.stream().map(T212Dtos.GroupHolding::value).filter(Objects::nonNull)
                .mapToDouble(Double::doubleValue).sum();
        return new T212Dtos.Ungrouped(round(value), holdings);
    }

    private static List<String> tickers(Context ctx, T212GroupEngine.Result result) {
        Set<String> tickers = new LinkedHashSet<>();
        result.groups().values().forEach(g -> tickers.addAll(g.lots().keySet()));
        if (ctx.positions() != null) {
            tickers.addAll(ctx.positions().keySet());
        }
        return List.copyOf(tickers);
    }

    // ---- validation ----

    private static Group find(List<Group> groups, String id) {
        return groups.stream().filter(g -> g.id().equals(id)).findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "No group " + id));
    }

    private static String validName(String name) {
        String clean = name == null ? "" : name.strip();
        int length = clean.codePointCount(0, clean.length());
        if (length < 1 || length > MAX_NAME_LENGTH) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "name must be 1–" + MAX_NAME_LENGTH + " characters");
        }
        return clean;
    }

    private static Double round(Double value) {
        return value == null ? null : round(value.doubleValue());
    }

    private static double round(double value) {
        return Math.round(value * 100) / 100.0;
    }
}
