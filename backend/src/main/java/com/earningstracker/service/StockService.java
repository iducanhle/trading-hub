package com.earningstracker.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.earningstracker.cache.TieredCache.Cached;
import com.earningstracker.domain.EarningsMath;
import com.earningstracker.domain.HistoryCalculator;
import com.earningstracker.domain.LivePrice;
import com.earningstracker.domain.PerformanceCalculator;
import com.earningstracker.domain.ReactionCalculator;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.IntradayBar;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.Quote;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.market.Symbols;
import com.earningstracker.web.dto.Dtos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Builds the stock detail responses of the contract. Profile and quote are required; price history and earnings
 * are optional (if unavailable without a cached copy, the fields that depend on them are null). {@code stale} is
 * true when any part was served from cache after a provider failure; {@code asOf} is the oldest fetch time used.
 */
@Service
public class StockService {

    static final int MAX_RECOMMENDATIONS = 6;
    private static final Logger log = LoggerFactory.getLogger(StockService.class);

    private final ProfileService profiles;
    private final QuoteService quotes;
    private final PriceService prices;
    private final IntradayService intraday;
    private final EarningsService earnings;
    private final StockExtrasService extras;
    private final ViewTracker views;
    private final EarningsProperties properties;
    private final ExecutorService executor;
    private final Clock clock;

    public StockService(ProfileService profiles, QuoteService quotes, PriceService prices, IntradayService intraday,
            EarningsService earnings, StockExtrasService extras, ViewTracker views, EarningsProperties properties,
            ExecutorService executor, Clock clock) {
        this.profiles = profiles;
        this.quotes = quotes;
        this.prices = prices;
        this.intraday = intraday;
        this.earnings = earnings;
        this.extras = extras;
        this.views = views;
        this.properties = properties;
        this.executor = executor;
        this.clock = clock;
    }

    public Dtos.StockOverview overview(String symbol) {
        CompletableFuture<Cached<StockProfile>> profileF = async(() -> profiles.profile(symbol));
        CompletableFuture<Cached<Quote>> quoteF = async(() -> quotes.quote(symbol));
        CompletableFuture<Cached<List<PriceBar>>> barsF = async(() -> prices.bars(symbol));
        CompletableFuture<Cached<List<EarningsReport>>> reportsF = async(() -> earnings.reports(symbol));
        Cached<StockProfile> profile = join(profileF);
        Cached<Quote> quote = join(quoteF);
        Cached<List<PriceBar>> bars = optional(barsF, "prices", symbol);
        Cached<List<EarningsReport>> reports = optional(reportsF, "earnings", symbol);
        views.viewed(symbol);

        List<PriceBar> barList = bars == null ? List.of() : bars.value();
        Quote q = quote.value();
        PerformanceCalculator.Performance performance = PerformanceCalculator.summary(barList, live(symbol, q));
        EarningsView view = view(symbol, reports, barList);
        StockProfile p = profile.value();
        return new Dtos.StockOverview(symbol, p.name(), p.exchange().displayName(), Symbols.region(symbol),
                p.currency(), p.logoUrl(), p.sector(), p.industry(), p.website(),
                new Dtos.QuoteInfo(q.price(), q.change(), q.changePercent(), q.previousClose(), q.asOf()),
                new Dtos.KeyStats(p.marketCap(), p.marketCapUsd(), p.week52High(), p.week52Low(), p.peRatio(),
                        p.epsTtm(), p.avgVolume()),
                new Dtos.Performance(performance.w1(), performance.m1(), performance.ytd(), performance.y1()),
                view.upcoming() == null ? null : DtoMapper.event(p, view.upcoming()),
                DtoMapper.stats(view.stats()), asOf(profile, quote, bars, reports), stale(profile, quote, bars, reports));
    }

    public Dtos.Prices prices(String symbol, PriceRange range) {
        if (range.intraday()) {
            return intradayPrices(symbol);
        }
        CompletableFuture<Cached<List<EarningsReport>>> reportsF = async(() -> earnings.reports(symbol));
        StockProfile profile = profiles.profile(symbol).value();
        Cached<List<PriceBar>> bars = prices.bars(symbol);
        Cached<List<EarningsReport>> reports = optional(reportsF, "earnings", symbol);
        List<PriceBar> all = bars.value();
        LocalDate from = (all.isEmpty() ? today(symbol) : all.getLast().date()).minus(range.span());
        EarningsView view = view(symbol, reports, all);

        List<Dtos.EarningsMarker> markers = new ArrayList<>();
        view.quarters().stream().filter(q -> q.reactionDay().isAfter(from)).forEach(q -> markers.add(
                new Dtos.EarningsMarker(q.reactionDay(), q.report().date(), q.report().time(),
                        q.result() == null ? null : q.result().name(),
                        EarningsMath.surprisePercent(q.report().epsEstimate(),
                                q.report().epsActual()))));
        if (view.upcoming() != null) {
            EarningsReport next = view.upcoming();
            markers.add(new Dtos.EarningsMarker(
                    ReactionCalculator.reactionDay(all, next.date(), next.time(), Symbols.region(symbol)),
                    next.date(), next.time(), "UPCOMING", null));
        }
        markers.sort(Comparator.comparing(Dtos.EarningsMarker::date));
        // Same base as the performance summary: the last close on or before the range's start date.
        Double baseClose = all.stream().filter(bar -> !bar.date().isAfter(from)).reduce((a, b) -> b)
                .map(PriceBar::close).orElse(null);
        return new Dtos.Prices(symbol, profile.currency(), range.label(),
                all.stream().filter(bar -> bar.date().isAfter(from))
                        .map(b -> new Dtos.PriceBar(b.date(), null, b.open(), b.high(), b.low(), b.close(),
                                b.volume()))
                        .toList(),
                baseClose, markers, asOf(bars, reports), stale(bars, reports));
    }

    /**
     * The latest session in 5-minute bars. {@code baseClose} is the close of the last completed session before
     * it, so the change is today's change; no earnings markers (they mark days).
     */
    private Dtos.Prices intradayPrices(String symbol) {
        StockProfile profile = profiles.profile(symbol).value();
        CompletableFuture<Cached<List<PriceBar>>> dailyF = async(() -> prices.bars(symbol));
        Cached<List<IntradayBar>> bars = intraday.bars(symbol);
        Cached<List<PriceBar>> daily = optional(dailyF, "prices", symbol);
        ZoneId zone = Symbols.sessionExchange(symbol).zone();
        LocalDate session = bars.value().isEmpty() ? today(symbol)
                : bars.value().getLast().time().atZone(zone).toLocalDate();
        Double baseClose = daily == null ? null : daily.value().stream().filter(b -> b.date().isBefore(session))
                .reduce((a, b) -> b).map(PriceBar::close).orElse(null);
        List<Dtos.PriceBar> out = bars.value().stream()
                .map(b -> new Dtos.PriceBar(b.time().atZone(zone).toLocalDate(), b.time(), b.open(), b.high(),
                        b.low(), b.close(), b.volume()))
                .toList();
        return new Dtos.Prices(symbol, profile.currency(), PriceRange.D1.label(), out, baseClose, List.of(),
                daily == null ? asOf(bars) : asOf(bars, daily), daily == null ? stale(bars) : stale(bars, daily));
    }

    public Dtos.History history(String symbol, HistoryCalculator.Period period, LocalDate before, int limit) {
        CompletableFuture<Cached<Quote>> quoteF = async(() -> quotes.quote(symbol));
        CompletableFuture<Cached<List<EarningsReport>>> reportsF = async(() -> earnings.reports(symbol));
        List<PriceBar> bars = prices.bars(symbol).value();
        Cached<Quote> quote = optional(quoteF, "quote", symbol);
        Set<LocalDate> reactionDays = view(symbol, optional(reportsF, "earnings", symbol), bars).quarters().stream()
                .map(EarningsView.Quarter::reactionDay).collect(Collectors.toSet());
        List<HistoryCalculator.Row> rows = HistoryCalculator.rows(bars,
                quote == null ? null : live(symbol, quote.value()), period, reactionDays, today(symbol));
        HistoryCalculator.Page page = HistoryCalculator.page(rows, before, limit);
        return new Dtos.History(period.name(), page.rows().stream()
                .map(r -> new Dtos.HistoryRow(r.periodStart(), r.periodEnd(), r.close(), r.changePercent(), r.volume(),
                        r.hasEarnings(), r.partial()))
                .toList(), page.nextBefore());
    }

    public Dtos.Earnings earnings(String symbol) {
        CompletableFuture<Cached<List<PriceBar>>> barsF = async(() -> prices.bars(symbol));
        StockProfile profile = profiles.profile(symbol).value();
        Cached<List<EarningsReport>> reports = earnings.reports(symbol);
        Cached<List<PriceBar>> bars = optional(barsF, "prices", symbol);
        EarningsView view = view(symbol, reports, bars == null ? List.of() : bars.value());
        return new Dtos.Earnings(view.upcoming() == null ? null : DtoMapper.event(profile, view.upcoming()),
                view.quarters().stream().map(DtoMapper::quarter).toList(), DtoMapper.stats(view.stats()),
                asOf(reports, bars), stale(reports, bars));
    }

    public List<Dtos.RecommendationPeriod> recommendations(String symbol) {
        return extras.recommendations(symbol).value().stream().limit(MAX_RECOMMENDATIONS)
                .map(r -> new Dtos.RecommendationPeriod(r.period().toString(), r.strongBuy(), r.buy(), r.hold(),
                        r.sell(), r.strongSell()))
                .toList();
    }

    public List<Dtos.NewsItem> news(String symbol, int limit) {
        return extras.news(symbol).value().stream().limit(limit)
                .map(n -> new Dtos.NewsItem(n.headline(), n.source(), n.url(), n.publishedAt(), n.imageUrl(),
                        n.summary()))
                .toList();
    }

    public List<Dtos.SearchResult> peers(String symbol) {
        List<SymbolMatch> peers = extras.peers(symbol).value();
        Map<String, String> logos = profiles.logos(peers.stream().map(SymbolMatch::symbol).toList());
        return peers.stream().map(m -> DtoMapper.searchResult(m, logos.get(m.symbol()))).toList();
    }

    private EarningsView view(String symbol, Cached<List<EarningsReport>> reports, List<PriceBar> bars) {
        return reports == null ? EarningsView.EMPTY
                : EarningsView.of(reports.value(), bars, Symbols.region(symbol), today(symbol), properties.windowDays());
    }

    private LivePrice live(String symbol, Quote quote) {
        return new LivePrice(Symbols.sessionExchange(symbol).localDate(quote.asOf()), quote.price(), quote.volume());
    }

    private LocalDate today(String symbol) {
        Exchange session = Symbols.sessionExchange(symbol);
        return LocalDate.now(clock.withZone(session.zone()));
    }

    private <T> CompletableFuture<T> async(Supplier<T> supplier) {
        return CompletableFuture.supplyAsync(supplier, executor);
    }

    private static <T> T join(CompletableFuture<T> future) {
        try {
            return future.join();
        } catch (CompletionException e) {
            throw e.getCause() instanceof RuntimeException cause ? cause : e;
        }
    }

    private static <T> T optional(CompletableFuture<T> future, String what, String symbol) {
        try {
            return future.join();
        } catch (CompletionException e) {
            log.info("No {} for {}: {}", what, symbol, e.getCause() == null ? e.getMessage() : e.getCause().getMessage());
            return null;
        }
    }

    private static Instant asOf(Cached<?>... parts) {
        return Stream.of(parts).filter(Objects::nonNull).map(Cached::fetchedAt).min(Comparator.naturalOrder())
                .orElse(null);
    }

    private static boolean stale(Cached<?>... parts) {
        return Stream.of(parts).filter(Objects::nonNull).anyMatch(Cached::stale);
    }
}
