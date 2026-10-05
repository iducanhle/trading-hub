package com.earningstracker.provider.alpaca;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import com.earningstracker.market.Exchange;
import com.earningstracker.market.IntradayBar;
import com.earningstracker.market.Region;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.IntradayProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.http.ProviderHttp;
import com.earningstracker.provider.http.ProviderHttpFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;

/**
 * Alpaca market data, free plan: US intraday bars from the IEX feed (prices match the market, volume is IEX's
 * share only). The intraday fallback behind Yahoo; keys go in headers.
 */
@Component
@Order(1)
public class AlpacaProvider implements IntradayProvider {

    public static final String ID = "alpaca";
    private static final int PAGE_SIZE = 10_000;
    /** 1W of 1-minute bars is about 2,000 IEX bars, so a few pages are plenty. */
    private static final int MAX_PAGES = 5;
    /** Covers weekends and holidays when looking for the latest session; the caller cuts longer ranges. */
    private static final Duration MARGIN = Duration.ofDays(7);

    private final ProviderHttp http;
    private final Clock clock;
    private final boolean enabled;

    public AlpacaProvider(AlpacaProperties properties, ProviderHttpFactory httpFactory, Clock clock) {
        this.enabled = StringUtils.hasText(properties.keyId()) && StringUtils.hasText(properties.secretKey());
        String keyId = enabled ? properties.keyId() : "";
        String secret = enabled ? properties.secretKey() : "";
        this.http = httpFactory.create(ID, properties.baseUrl(), properties.minInterval(), 0, null,
                AlpacaProvider::kind, builder -> builder
                        .defaultHeader("APCA-API-KEY-ID", keyId)
                        .defaultHeader("APCA-API-SECRET-KEY", secret));
        this.clock = clock;
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
    public List<IntradayBar> intradayBars(String symbol, Duration interval, Period lookback) {
        if (Symbols.region(symbol) != Region.US) {
            throw new ProviderException(ID, Kind.UNSUPPORTED, "covers US symbols only");
        }
        Instant now = clock.instant();
        Instant start = now.atZone(ZoneOffset.UTC).minus(lookback).minus(MARGIN).toInstant();
        List<IntradayBar> bars = new ArrayList<>();
        String pageToken = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            JsonNode body = page(Symbols.toDotClass(symbol), timeframe(interval), start, now, pageToken);
            for (JsonNode bar : body.path("bars")) {
                String time = Json.text(bar.path("t"));
                Double open = Json.number(bar.path("o"));
                Double high = Json.number(bar.path("h"));
                Double low = Json.number(bar.path("l"));
                Double close = Json.number(bar.path("c"));
                if (time == null || open == null || high == null || low == null || close == null) {
                    continue;
                }
                Long volume = Json.longNumber(bar.path("v"));
                bars.add(new IntradayBar(Instant.parse(time), open, high, low, close, volume == null ? 0 : volume));
            }
            pageToken = Json.text(body.path("next_page_token"));
            if (pageToken == null) {
                break;
            }
        }
        return lookback.isZero() ? latestSession(bars) : List.copyOf(bars);
    }

    private JsonNode page(String symbol, String timeframe, Instant start, Instant end, String pageToken) {
        String uri = "/v2/stocks/{s}/bars?timeframe={tf}&start={start}&end={end}&limit={limit}&feed=iex"
                + "&adjustment=split&sort=asc";
        return http.call(() -> http.parse(http.client().get()
                .uri(pageToken == null ? uri : uri + "&page_token={token}", symbol, timeframe, start, end, PAGE_SIZE,
                        pageToken)
                .retrieve().body(String.class)));
    }

    /** The bars of the last trading day present (the running one while the exchange is open). */
    private static List<IntradayBar> latestSession(List<IntradayBar> bars) {
        if (bars.isEmpty()) {
            return List.of();
        }
        Exchange session = Exchange.usSession();
        LocalDate last = session.localDate(bars.getLast().time());
        return bars.stream().filter(b -> session.localDate(b.time()).equals(last)).toList();
    }

    static String timeframe(Duration interval) {
        long minutes = interval.toMinutes();
        return minutes % 60 == 0 ? minutes / 60 + "Hour" : minutes + "Min";
    }

    /** 403 = bad keys or a feed the plan lacks, 422 = invalid symbol or parameters. */
    static Kind kind(int status, String body) {
        if (status == 403) {
            return Kind.UNSUPPORTED;
        }
        if (status == 422 || status == 404) {
            return Kind.NOT_FOUND;
        }
        return ProviderHttp.DEFAULT_STATUS_MAPPER.kind(status, body);
    }
}
