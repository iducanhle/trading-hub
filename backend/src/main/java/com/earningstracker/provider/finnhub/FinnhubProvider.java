package com.earningstracker.provider.finnhub;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import com.earningstracker.market.CompanyProfile;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.NewsArticle;
import com.earningstracker.market.Quote;
import com.earningstracker.market.RecommendationTrend;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.EarningsCalendarProvider;
import com.earningstracker.provider.EarningsProvider;
import com.earningstracker.provider.ListingProvider;
import com.earningstracker.provider.NewsProvider;
import com.earningstracker.provider.PeersProvider;
import com.earningstracker.provider.ProfileProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.QuoteProvider;
import com.earningstracker.provider.RecommendationProvider;
import com.earningstracker.provider.SymbolSearchProvider;
import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.http.ProviderHttp;
import com.earningstracker.provider.http.ProviderHttpFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.MissingNode;

/**
 * Finnhub free tier: US symbols only (EU and unknown symbols answer 403). Market cap and volume averages arrive
 * in millions. Symbols use a dot for share classes ({@code BRK.B}).
 */
@Component
public class FinnhubProvider implements SymbolSearchProvider, QuoteProvider, ProfileProvider, EarningsProvider,
        EarningsCalendarProvider, RecommendationProvider, NewsProvider, PeersProvider, ListingProvider {

    public static final String ID = "finnhub";
    private static final Logger log = LoggerFactory.getLogger(FinnhubProvider.class);

    private final ProviderHttp http;
    private final FinnhubSymbolDirectory directory;
    private final Clock clock;
    private final boolean enabled;

    public FinnhubProvider(FinnhubProperties properties, ProviderHttpFactory httpFactory, Clock clock) {
        this.enabled = StringUtils.hasText(properties.apiKey());
        String apiKey = enabled ? properties.apiKey() : "";
        this.http = httpFactory.create(ID, properties.baseUrl(), properties.minInterval(), 0, null, null,
                builder -> builder.defaultHeader("X-Finnhub-Token", apiKey));
        this.directory = new FinnhubSymbolDirectory(http, clock);
        this.clock = clock;
    }

    /** Shared with {@link FinnhubEpsProvider} so both use one rate limiter. */
    ProviderHttp http() {
        return http;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    @Override
    public List<SymbolMatch> search(String query, Region region, int limit) {
        if (region != Region.US) {
            return List.of();
        }
        directory.requireLoaded(); // before /search, so a directory failure falls back without wasting a call
        JsonNode body = http.getJson("/search?q={q}&exchange=US", query);
        List<SymbolMatch> matches = new ArrayList<>();
        for (JsonNode result : body.path("result")) {
            if (!FinnhubSymbolDirectory.isEquity(Json.text(result.path("type")))) {
                continue;
            }
            String symbol = Symbols.fromDotClass(Objects.requireNonNullElse(Json.text(result.path("symbol")), ""));
            Optional<FinnhubSymbolDirectory.Listing> listing = directory.find(symbol);
            if (listing.isEmpty() || matches.stream().anyMatch(m -> m.symbol().equals(symbol))) {
                continue;
            }
            String name = Objects.requireNonNullElse(Json.text(result.path("description")), listing.get().name());
            matches.add(new SymbolMatch(symbol, name, listing.get().exchange(), "USD"));
            if (matches.size() >= limit) {
                break;
            }
        }
        return matches;
    }

    @Override
    public Quote quote(String symbol) {
        requireUs(symbol);
        JsonNode quote = http.getJson("/quote?symbol={s}", Symbols.toDotClass(symbol));
        Double price = Json.number(quote.path("c"));
        Long time = Json.longNumber(quote.path("t"));
        if (price == null || price == 0 || time == null || time == 0) {
            throw notFound(symbol);
        }
        Double previousClose = Json.number(quote.path("pc"));
        return Quote.of(symbol, price, previousClose != null ? previousClose : price, "USD",
                Instant.ofEpochSecond(time));
    }

    @Override
    public CompanyProfile profile(String symbol) {
        return profile(symbol, true);
    }

    /** {@code /stock/profile2} only (one call instead of two): what the calendar needs, without key stats. */
    @Override
    public CompanyProfile basics(String symbol) {
        return profile(symbol, false);
    }

    private CompanyProfile profile(String symbol, boolean withMetrics) {
        requireUs(symbol);
        String finnhubSymbol = Symbols.toDotClass(symbol);
        JsonNode profile = http.getJson("/stock/profile2?symbol={s}", finnhubSymbol);
        String name = Json.text(profile.path("name"));
        if (name == null) {
            throw notFound(symbol);
        }
        Exchange exchange = exchangeOf(symbol, Json.text(profile.path("exchange")));
        if (exchange == null) {
            throw new ProviderException(ID, Kind.NOT_FOUND, symbol + " is not listed on NYSE, NASDAQ or NYSE American");
        }
        JsonNode metric = withMetrics ? metrics(finnhubSymbol) : MissingNode.getInstance();
        String currency = Objects.requireNonNullElse(Json.text(profile.path("currency")), "USD");
        Double marketCapMillions = Json.number(profile.path("marketCapitalization"));
        Double avgVolumeMillions = Json.number(metric.path("3MonthAverageTradingVolume"));
        return new CompanyProfile(symbol, name, exchange, currency,
                Objects.requireNonNullElse(Json.text(profile.path("estimateCurrency")), currency),
                null, Json.text(profile.path("finnhubIndustry")), Json.text(profile.path("weburl")),
                Json.text(profile.path("logo")), Json.text(profile.path("country")),
                marketCapMillions == null ? null : marketCapMillions * 1_000_000,
                Json.number(metric.path("52WeekHigh")), Json.number(metric.path("52WeekLow")),
                Json.number(metric.path("peTTM")), Json.number(metric.path("epsTTM")),
                avgVolumeMillions == null ? null : Math.round(avgVolumeMillions * 1_000_000));
    }

    /**
     * The per-symbol calendar: on the free tier, upcoming quarters and about a month back. Finnhub's EPS surprises
     * are a separate provider ({@link FinnhubEpsProvider}) so they can rank after FMP and Yahoo.
     */
    @Override
    public List<EarningsReport> earnings(String symbol) {
        requireUs(symbol);
        LocalDate today = LocalDate.now(clock);
        JsonNode calendar = http.getJson("/calendar/earnings?symbol={s}&from={from}&to={to}", Symbols.toDotClass(symbol),
                today.minusYears(1), today.plusYears(1));
        List<EarningsReport> reports = new ArrayList<>();
        for (JsonNode row : calendar.path("earningsCalendar")) {
            reports.add(calendarRow(symbol, row));
        }
        return reports;
    }

    /** US-wide calendar; events for OTC or non-equity symbols are dropped when the directory is available. */
    @Override
    public List<EarningsReport> calendar(LocalDate from, LocalDate to) {
        JsonNode body = http.getJson("/calendar/earnings?from={from}&to={to}", from, to);
        Optional<Map<String, FinnhubSymbolDirectory.Listing>> listings = directory.ifAvailable();
        List<EarningsReport> reports = new ArrayList<>();
        for (JsonNode row : body.path("earningsCalendar")) {
            String symbol = Symbols.fromDotClass(Objects.requireNonNullElse(Json.text(row.path("symbol")), ""));
            if (Symbols.isValid(symbol) && listings.map(l -> l.containsKey(symbol)).orElse(true)) {
                reports.add(calendarRow(symbol, row));
            }
        }
        return reports;
    }

    @Override
    public List<RecommendationTrend> recommendations(String symbol) {
        requireUs(symbol);
        JsonNode rows = http.getJson("/stock/recommendation?symbol={s}", Symbols.toDotClass(symbol));
        List<RecommendationTrend> trends = new ArrayList<>();
        for (JsonNode row : rows) {
            String period = Json.text(row.path("period"));
            if (period != null && period.length() >= 7) {
                trends.add(new RecommendationTrend(YearMonth.parse(period.substring(0, 7)),
                        count(row, "strongBuy"), count(row, "buy"), count(row, "hold"), count(row, "sell"),
                        count(row, "strongSell")));
            }
        }
        trends.sort(Comparator.comparing(RecommendationTrend::period).reversed());
        return trends;
    }

    @Override
    public List<NewsArticle> news(String symbol, int limit) {
        requireUs(symbol);
        LocalDate today = LocalDate.now(clock);
        JsonNode rows = http.getJson("/company-news?symbol={s}&from={from}&to={to}", Symbols.toDotClass(symbol),
                today.minusDays(14), today);
        List<NewsArticle> articles = new ArrayList<>();
        for (JsonNode row : rows) {
            String headline = Json.text(row.path("headline"));
            String url = Json.text(row.path("url"));
            Long time = Json.longNumber(row.path("datetime"));
            if (headline != null && url != null && time != null) {
                articles.add(new NewsArticle(headline, Json.text(row.path("source")), url,
                        Instant.ofEpochSecond(time), Json.text(row.path("image")), Json.text(row.path("summary"))));
            }
        }
        return articles.stream().sorted(Comparator.comparing(NewsArticle::publishedAt).reversed()).limit(limit)
                .toList();
    }

    @Override
    public List<String> peers(String symbol) {
        requireUs(symbol);
        JsonNode rows = http.getJson("/stock/peers?symbol={s}", Symbols.toDotClass(symbol));
        Optional<Map<String, FinnhubSymbolDirectory.Listing>> listings = directory.ifAvailable();
        List<String> peers = new ArrayList<>();
        for (JsonNode row : rows) {
            String peer = Symbols.fromDotClass(Objects.requireNonNullElse(Json.text(row), ""));
            if (!peer.equals(symbol) && Symbols.isValid(peer) && !peers.contains(peer)
                    && listings.map(l -> l.containsKey(peer)).orElse(true)) {
                peers.add(peer);
            }
        }
        return peers;
    }

    /** From the symbol directory (no request once loaded); names are upper case as Finnhub lists them. */
    @Override
    public List<SymbolMatch> listings(Collection<String> symbols) {
        directory.requireLoaded();
        List<SymbolMatch> matches = new ArrayList<>();
        for (String symbol : symbols) {
            directory.find(symbol).ifPresent(listing -> matches.add(new SymbolMatch(symbol,
                    Objects.requireNonNullElse(listing.name(), symbol), listing.exchange(), "USD")));
        }
        return matches;
    }

    private EarningsReport calendarRow(String symbol, JsonNode row) {
        return new EarningsReport(symbol, date(Json.text(row.path("date"))), reportTime(Json.text(row.path("hour"))),
                null, Json.intNumber(row.path("quarter")), Json.intNumber(row.path("year")), "USD",
                Json.number(row.path("epsEstimate")), Json.number(row.path("epsActual")),
                Json.positive(Json.number(row.path("revenueEstimate"))), // 0 means "no estimate"
                Json.number(row.path("revenueActual")), null);
    }

    static ReportTime reportTime(String hour) {
        if (hour == null) {
            return ReportTime.UNKNOWN;
        }
        return switch (hour.toLowerCase(Locale.ROOT)) {
            case "bmo" -> ReportTime.BMO;
            case "amc" -> ReportTime.AMC;
            case "dmh" -> ReportTime.DMH;
            default -> ReportTime.UNKNOWN;
        };
    }

    private Exchange exchangeOf(String symbol, String finnhubExchange) {
        Optional<FinnhubSymbolDirectory.Listing> listing = directory.ifAvailable().map(l -> l.get(symbol));
        if (listing.isPresent()) {
            return listing.get().exchange();
        }
        if (finnhubExchange == null) {
            return null;
        }
        String name = finnhubExchange.toUpperCase(Locale.ROOT);
        if (name.contains("AMERICAN") || name.contains("NYSE MKT")) {
            return Exchange.NYSE_AMERICAN;
        }
        if (name.contains("NASDAQ")) {
            return Exchange.NASDAQ;
        }
        return name.contains("NEW YORK STOCK EXCHANGE") || name.equals("NYSE") ? Exchange.NYSE : null;
    }

    private JsonNode metrics(String finnhubSymbol) {
        try {
            return http.getJson("/stock/metric?symbol={s}&metric=all", finnhubSymbol).path("metric");
        } catch (ProviderException e) {
            log.debug("Finnhub metrics unavailable for {}: {}", finnhubSymbol, e.getMessage());
            return MissingNode.getInstance();
        }
    }


    private static void requireUs(String symbol) {
        if (Symbols.region(symbol) != Region.US) {
            throw new ProviderException(ID, Kind.UNSUPPORTED, "free tier covers US symbols only");
        }
    }

    private static ProviderException notFound(String symbol) {
        return new ProviderException(ID, Kind.NOT_FOUND, "no data for " + symbol);
    }

    private static int count(JsonNode row, String field) {
        return Objects.requireNonNullElse(Json.intNumber(row.path(field)), 0);
    }

    private static LocalDate date(String value) {
        return value == null || value.length() < 10 ? null : LocalDate.parse(value.substring(0, 10));
    }

}
