package com.earningstracker.provider.yahoo;

import java.io.ByteArrayInputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import com.earningstracker.market.CompanyProfile;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Exchange;
import com.earningstracker.market.Money;
import com.earningstracker.market.NewsArticle;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.PriceBars;
import com.earningstracker.market.Quote;
import com.earningstracker.market.RecommendationTrend;
import com.earningstracker.market.Region;
import com.earningstracker.market.SymbolMatch;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.EarningsProvider;
import com.earningstracker.provider.FxRateProvider;
import com.earningstracker.provider.ListingProvider;
import com.earningstracker.provider.NewsProvider;
import com.earningstracker.provider.PeersProvider;
import com.earningstracker.provider.PriceHistoryProvider;
import com.earningstracker.provider.ProfileProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.QuoteProvider;
import com.earningstracker.provider.RecommendationProvider;
import com.earningstracker.provider.SymbolSearchProvider;
import com.earningstracker.provider.SymbolValidator;
import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.http.ProviderHttp;
import com.earningstracker.provider.http.ProviderHttpFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Yahoo Finance's unofficial endpoints, isolated here because they can change without notice. Covers every
 * supported US and EU exchange. LSE prices come in pence and are normalized to GBP (market cap and trailing EPS
 * are already in pounds).
 */
@Component
public class YahooProvider implements SymbolSearchProvider, QuoteProvider, ProfileProvider, PriceHistoryProvider,
        EarningsProvider, RecommendationProvider, NewsProvider, PeersProvider, FxRateProvider, SymbolValidator, ListingProvider {

    public static final String ID = "yahoo";
    static final Map<String, Exchange> US_EXCHANGES = Map.of("NYQ", Exchange.NYSE, "NMS", Exchange.NASDAQ,
            "NGM", Exchange.NASDAQ, "NCM", Exchange.NASDAQ, "NAS", Exchange.NASDAQ, "ASE", Exchange.NYSE_AMERICAN);
    private static final Logger log = LoggerFactory.getLogger(YahooProvider.class);
    private static final int VALIDATION_BATCH = 50;
    private static final int EARNINGS_ROWS = 40;
    private static final Pattern MONTH_OFFSET = Pattern.compile("(-?\\d+)m");

    private final ProviderHttp http;
    private final YahooSession session;
    private final YahooProperties properties;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public YahooProvider(YahooProperties properties, ProviderHttpFactory httpFactory, JsonMapper jsonMapper,
            Clock clock) {
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        this.http = httpFactory.create(ID, properties.query2Url(), properties.minInterval(), 0, cookies,
                YahooProvider::kind, builder -> builder
                        .defaultHeader(HttpHeaders.USER_AGENT, properties.userAgent())
                        .defaultHeader(HttpHeaders.ACCEPT_LANGUAGE, "en-US,en;q=0.9"));
        this.session = new YahooSession(http, properties, cookies);
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    @Override
    public String id() {
        return ID;
    }

    /** 401/403 mean a stale cookie or crumb: {@link #withCrumb} renews the session once. */
    static Kind kind(int status, String body) {
        return status == 401 || status == 403 ? Kind.UNSUPPORTED : ProviderHttp.DEFAULT_STATUS_MAPPER.kind(status, body);
    }

    /** US search as-is; EU search with a German locale, which ranks European listings first. */
    @Override
    public List<SymbolMatch> search(String query, Region region, int limit) {
        boolean eu = region == Region.EU;
        JsonNode body = http.getJson("/v1/finance/search?q={q}&quotesCount=10&newsCount=0&enableFuzzyQuery=false"
                + "&region={region}&lang={lang}", query, eu ? "DE" : "US", eu ? "de-DE" : "en-US");
        List<SymbolMatch> matches = new ArrayList<>();
        for (JsonNode quote : body.path("quotes")) {
            Optional<String> symbol = Symbols.normalize(Json.text(quote.path("symbol")));
            if (!"EQUITY".equals(Json.text(quote.path("quoteType"))) || symbol.isEmpty()
                    || Symbols.region(symbol.get()) != region) {
                continue;
            }
            Exchange exchange = eu ? Symbols.euExchange(symbol.get()).orElseThrow()
                    : usExchange(Json.text(quote.path("exchange")));
            if (exchange == null) {
                continue;
            }
            String name = Objects.requireNonNullElse(Json.text(quote.path("longname")),
                    Objects.requireNonNullElse(Json.text(quote.path("shortname")), symbol.get()));
            matches.add(new SymbolMatch(symbol.get(), name, exchange, exchange.currency()));
            if (matches.size() >= limit) {
                break;
            }
        }
        return matches;
    }

    @Override
    public Quote quote(String symbol) {
        JsonNode meta = chart(symbol, "range=1d").path("meta");
        Double price = Json.number(meta.path("regularMarketPrice"));
        Long time = Json.longNumber(meta.path("regularMarketTime"));
        if (price == null || time == null) {
            throw new ProviderException(ID, Kind.BAD_RESPONSE, "no price for " + symbol);
        }
        Double previousClose = Objects.requireNonNullElse(Json.number(meta.path("chartPreviousClose")),
                Objects.requireNonNullElse(Json.number(meta.path("previousClose")), price));
        String currency = Json.text(meta.path("currency"));
        return Quote.of(symbol, Money.toMajor(price, currency), Money.toMajor(previousClose, currency),
                Money.majorCurrency(currency), Instant.ofEpochSecond(time),
                Json.longNumber(meta.path("regularMarketVolume")));
    }

    @Override
    public CompanyProfile profile(String symbol) {
        JsonNode result = quoteSummary(symbol, "price,summaryDetail,defaultKeyStatistics,assetProfile,earnings");
        JsonNode price = result.path("price");
        JsonNode detail = result.path("summaryDetail");
        Exchange exchange = exchangeOf(symbol, Json.text(price.path("exchange")));
        String rawCurrency = Objects.requireNonNullElse(Json.text(price.path("currency")),
                Objects.requireNonNullElse(Json.text(detail.path("currency")), exchange.currency()));
        String financialCurrency = Json.text(result.path("earnings").path("financialCurrency"));
        JsonNode profile = result.path("assetProfile");
        Double averageVolume = Json.raw(detail.path("averageVolume"));
        return new CompanyProfile(symbol,
                Objects.requireNonNullElse(Json.text(price.path("longName")),
                        Objects.requireNonNullElse(Json.text(price.path("shortName")), symbol)),
                exchange, Money.majorCurrency(rawCurrency),
                Money.majorCurrency(Objects.requireNonNullElse(financialCurrency, rawCurrency)),
                Json.text(profile.path("sector")), Json.text(profile.path("industry")),
                Json.text(profile.path("website")), null, Json.text(profile.path("country")),
                Objects.requireNonNullElse(Json.raw(price.path("marketCap")), Json.raw(detail.path("marketCap"))),
                Money.toMajor(Json.raw(detail.path("fiftyTwoWeekHigh")), rawCurrency),
                Money.toMajor(Json.raw(detail.path("fiftyTwoWeekLow")), rawCurrency),
                Json.raw(detail.path("trailingPE")), Json.raw(result.path("defaultKeyStatistics").path("trailingEps")),
                averageVolume == null ? null : Math.round(averageVolume));
    }

    @Override
    public List<PriceBar> dailyBars(String symbol, LocalDate from) {
        long start = from.atStartOfDay(ZoneOffset.UTC).toEpochSecond();
        JsonNode result = chart(symbol, "period1=" + start + "&period2=" + clock.instant().getEpochSecond());
        JsonNode meta = result.path("meta");
        String currency = Json.text(meta.path("currency"));
        Exchange session = Symbols.sessionExchange(symbol);
        ZoneId zone = zone(Json.text(meta.path("exchangeTimezoneName")), session.zone());
        JsonNode quote = result.path("indicators").path("quote").path(0);
        Map<LocalDate, PriceBar> bars = new LinkedHashMap<>();
        JsonNode timestamps = result.path("timestamp");
        for (int i = 0; i < timestamps.size(); i++) {
            Double open = Json.number(quote.path("open").path(i));
            Double high = Json.number(quote.path("high").path(i));
            Double low = Json.number(quote.path("low").path(i));
            Double close = Json.number(quote.path("close").path(i));
            Long time = Json.longNumber(timestamps.path(i));
            if (open == null || high == null || low == null || close == null || time == null) {
                continue;
            }
            LocalDate date = Instant.ofEpochSecond(time).atZone(zone).toLocalDate();
            Long volume = Json.longNumber(quote.path("volume").path(i));
            if (!date.isBefore(from)) {
                bars.put(date, new PriceBar(date, Money.toMajor(open, currency), Money.toMajor(high, currency),
                        Money.toMajor(low, currency), Money.toMajor(close, currency), volume == null ? 0 : volume));
            }
        }
        return PriceBars.completedSessions(List.copyOf(bars.values()), session, clock.instant());
    }

    @Override
    public List<EarningsReport> earnings(String symbol) {
        JsonNode summary = quoteSummary(symbol, "price,earnings,earningsHistory,calendarEvents,earningsTrend");
        JsonNode spEarnings;
        try {
            spEarnings = spEarnings(symbol);
        } catch (ProviderException e) {
            log.info("Yahoo earnings dates unavailable for {} ({}); using quote summary only", symbol, e.getMessage());
            spEarnings = summary.path("none");
        }
        Exchange exchange = Symbols.sessionExchange(symbol);
        return YahooEarnings.merge(symbol, spEarnings, summary, LocalDate.now(clock.withZone(exchange.zone())),
                exchange);
    }

    @Override
    public List<RecommendationTrend> recommendations(String symbol) {
        JsonNode trends = quoteSummary(symbol, "recommendationTrend").path("recommendationTrend").path("trend");
        YearMonth thisMonth = YearMonth.now(clock);
        List<RecommendationTrend> result = new ArrayList<>();
        for (JsonNode trend : trends) {
            Matcher offset = MONTH_OFFSET.matcher(Objects.requireNonNullElse(Json.text(trend.path("period")), ""));
            if (!offset.matches()) {
                continue;
            }
            RecommendationTrend item = new RecommendationTrend(thisMonth.plusMonths(Integer.parseInt(offset.group(1))),
                    count(trend, "strongBuy"), count(trend, "buy"), count(trend, "hold"), count(trend, "sell"),
                    count(trend, "strongSell"));
            if (item.strongBuy() + item.buy() + item.hold() + item.sell() + item.strongSell() > 0) {
                result.add(item);
            }
        }
        result.sort(Comparator.comparing(RecommendationTrend::period).reversed());
        return result;
    }

    /** Per-symbol RSS feed (works for EU symbols too); it has no source name or image. */
    @Override
    public List<NewsArticle> news(String symbol, int limit) {
        String xml = http.getText(properties.rssUrl() + "?s={s}&region=US&lang=en-US", symbol);
        List<NewsArticle> articles = new ArrayList<>();
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setExpandEntityReferences(false);
            Document document = factory.newDocumentBuilder()
                    .parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
            NodeList items = document.getElementsByTagName("item");
            for (int i = 0; i < items.getLength(); i++) {
                Element item = (Element) items.item(i);
                String title = child(item, "title");
                String link = child(item, "link");
                Instant published = rfc1123(child(item, "pubDate"));
                if (title != null && link != null && published != null) {
                    String description = child(item, "description");
                    articles.add(new NewsArticle(title, source(link), link, published, null,
                            description == null ? null : description.replaceAll("<[^>]+>", "").strip()));
                }
            }
        } catch (Exception e) {
            throw new ProviderException(ID, Kind.BAD_RESPONSE, "unreadable news feed: " + e.getClass().getSimpleName());
        }
        return articles.stream().sorted(Comparator.comparing(NewsArticle::publishedAt).reversed()).limit(limit)
                .toList();
    }

    @Override
    public List<String> peers(String symbol) {
        JsonNode recommended = http.getJson("/v6/finance/recommendationsbysymbol/{s}", symbol)
                .path("finance").path("result").path(0).path("recommendedSymbols");
        List<String> peers = new ArrayList<>();
        for (JsonNode peer : recommended) {
            Symbols.normalize(Json.text(peer.path("symbol")))
                    .filter(p -> !p.equals(symbol) && !peers.contains(p))
                    .ifPresent(peers::add);
        }
        return peers;
    }

    @Override
    public double usdPerUnit(String currency) {
        Double rate = Json.number(chart(currency + "USD=X", "range=5d").path("meta").path("regularMarketPrice"));
        if (rate == null || rate <= 0) {
            throw new ProviderException(ID, Kind.BAD_RESPONSE, "no FX rate for " + currency);
        }
        return rate;
    }

    /** Symbols Yahoo knows, checked with batch quotes; unknown symbols are simply missing from the answer. */
    @Override
    public Set<String> existingSymbols(Collection<String> symbols) {
        List<String> all = List.copyOf(symbols);
        Set<String> found = new HashSet<>();
        for (int from = 0; from < all.size(); from += VALIDATION_BATCH) {
            String batch = String.join(",", all.subList(from, Math.min(all.size(), from + VALIDATION_BATCH)));
            JsonNode result = withCrumb(crumb -> http.getJson("/v7/finance/quote?symbols={s}&crumb={c}", batch, crumb))
                    .path("quoteResponse").path("result");
            result.forEach(quote -> Symbols.normalize(Json.text(quote.path("symbol"))).ifPresent(found::add));
        }
        return found;
    }

    /** One batch quote for all symbols (50 per request): names, exchanges and currencies. */
    @Override
    public List<SymbolMatch> listings(Collection<String> symbols) {
        List<String> all = List.copyOf(symbols);
        List<SymbolMatch> matches = new ArrayList<>();
        for (int from = 0; from < all.size(); from += VALIDATION_BATCH) {
            String batch = String.join(",", all.subList(from, Math.min(all.size(), from + VALIDATION_BATCH)));
            JsonNode result = withCrumb(crumb -> http.getJson("/v7/finance/quote?symbols={s}&crumb={c}", batch, crumb))
                    .path("quoteResponse").path("result");
            for (JsonNode quote : result) {
                Optional<String> symbol = Symbols.normalize(Json.text(quote.path("symbol")));
                if (symbol.isEmpty() || !"EQUITY".equals(Json.text(quote.path("quoteType")))) {
                    continue;
                }
                Exchange exchange = Symbols.region(symbol.get()) == Region.EU
                        ? Symbols.euExchange(symbol.get()).orElseThrow()
                        : usExchange(Json.text(quote.path("exchange")));
                if (exchange != null) {
                    String currency = Json.text(quote.path("currency"));
                    matches.add(new SymbolMatch(symbol.get(),
                            Objects.requireNonNullElse(Json.text(quote.path("longName")),
                                    Objects.requireNonNullElse(Json.text(quote.path("shortName")), symbol.get())),
                            exchange, currency == null ? exchange.currency() : Money.majorCurrency(currency)));
                }
            }
        }
        return matches;
    }

    private JsonNode chart(String symbol, String query) {
        JsonNode body = http.getJson(properties.query1Url() + "/v8/finance/chart/{s}?" + query + "&interval=1d", symbol);
        JsonNode result = body.path("chart").path("result").path(0);
        if (result.isMissingNode() || result.isNull()) {
            throw new ProviderException(ID, Kind.NOT_FOUND, "no chart for " + symbol);
        }
        return result;
    }

    private JsonNode quoteSummary(String symbol, String modules) {
        JsonNode body = withCrumb(crumb -> http.getJson("/v10/finance/quoteSummary/{s}?modules={m}&crumb={c}",
                symbol, modules, crumb));
        JsonNode result = body.path("quoteSummary").path("result").path(0);
        if (result.isMissingNode() || result.isNull()) {
            throw new ProviderException(ID, Kind.NOT_FOUND, "no quote summary for " + symbol);
        }
        return result;
    }

    private JsonNode spEarnings(String symbol) {
        Map<String, Object> request = Map.of(
                "size", EARNINGS_ROWS, "offset", 0, "sortField", "startdatetime", "sortType", "DESC",
                "entityIdType", "sp_earnings",
                "includeFields", List.of("ticker", "eventname", "startdatetime", "startdatetimetype", "epsestimate",
                        "epsactual", "eventtype"),
                "query", Map.of("operator", "and",
                        "operands", List.of(Map.of("operator", "eq", "operands", List.of("ticker", symbol)))));
        String body = jsonMapper.writeValueAsString(request);
        return withCrumb(crumb -> http.parse(http.call(() -> http.client().post()
                .uri(properties.query1Url() + "/v1/finance/visualization?lang=en-US&region=US&crumb={c}", crumb)
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().body(String.class))));
    }

    /** Runs a crumb-protected request, renewing the session once if Yahoo rejects the cookie or crumb. */
    private <T> T withCrumb(Function<String, T> request) {
        String crumb = session.crumb();
        try {
            return request.apply(crumb);
        } catch (ProviderException e) {
            if (e.kind() != Kind.UNSUPPORTED) {
                throw e;
            }
            log.info("Yahoo rejected the session ({}); starting a new one", e.getMessage());
            session.invalidate(crumb);
            return request.apply(session.crumb());
        }
    }

    private static Exchange exchangeOf(String symbol, String yahooExchange) {
        if (Symbols.region(symbol) == Region.EU) {
            return Symbols.euExchange(symbol).orElseThrow();
        }
        Exchange exchange = usExchange(yahooExchange);
        if (exchange == null) {
            throw new ProviderException(ID, Kind.NOT_FOUND, symbol + " is not listed on NYSE, NASDAQ or NYSE American");
        }
        return exchange;
    }

    /** Null-safe: immutable maps throw on get(null). */
    static Exchange usExchange(String yahooCode) {
        return yahooCode == null ? null : US_EXCHANGES.get(yahooCode);
    }

    private static ZoneId zone(String name, ZoneId fallback) {
        try {
            return name == null ? fallback : ZoneId.of(name);
        } catch (DateTimeException e) {
            return fallback;
        }
    }

    private static String child(Element parent, String tag) {
        NodeList nodes = parent.getElementsByTagName(tag);
        String text = nodes.getLength() == 0 ? null : nodes.item(0).getTextContent();
        return text == null || text.isBlank() ? null : text.strip();
    }

    private static Instant rfc1123(String value) {
        try {
            return value == null ? null : ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
        } catch (DateTimeException e) {
            return null;
        }
    }

    private static String source(String link) {
        try {
            String host = URI.create(link).getHost();
            if (host == null) {
                return null;
            }
            return host.endsWith("yahoo.com") ? "Yahoo Finance" : host.replaceFirst("^www\\.", "");
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static int count(JsonNode node, String field) {
        return Objects.requireNonNullElse(Json.intNumber(node.path(field)), 0);
    }
}
