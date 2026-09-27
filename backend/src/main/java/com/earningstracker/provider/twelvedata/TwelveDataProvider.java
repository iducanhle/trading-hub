package com.earningstracker.provider.twelvedata;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import com.earningstracker.market.Exchange;
import com.earningstracker.market.PriceBar;
import com.earningstracker.market.PriceBars;
import com.earningstracker.market.Region;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.PriceHistoryProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.http.ProviderHttp;
import com.earningstracker.provider.http.ProviderHttpFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;

/** Twelve Data free tier: split-adjusted US daily bars (EU needs a paid plan), 1 credit per call. */
@Component
public class TwelveDataProvider implements PriceHistoryProvider {

    public static final String ID = "twelvedata";
    /** The API's maximum; 5 years of daily bars is about 1,260. */
    private static final int MAX_OUTPUT_SIZE = 5000;

    private final ProviderHttp http;
    private final Clock clock;
    private final boolean enabled;

    public TwelveDataProvider(TwelveDataProperties properties, ProviderHttpFactory httpFactory, Clock clock) {
        this.enabled = StringUtils.hasText(properties.apiKey());
        String apiKey = enabled ? properties.apiKey() : "";
        this.http = httpFactory.create(ID, properties.baseUrl(), properties.minInterval(), properties.dailyLimit(),
                null, TwelveDataProvider::kind, builder -> builder.defaultHeader("Authorization", "apikey " + apiKey));
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
    public List<PriceBar> dailyBars(String symbol, LocalDate from) {
        if (Symbols.region(symbol) != Region.US) {
            throw new ProviderException(ID, Kind.UNSUPPORTED, "free tier covers US symbols only");
        }
        JsonNode body = http.call(() -> {
            String text = http.client().get()
                    .uri("/time_series?symbol={s}&interval=1day&start_date={from}&outputsize={size}&order=ASC",
                            Symbols.toDotClass(symbol), from, MAX_OUTPUT_SIZE)
                    .retrieve().body(String.class);
            JsonNode json = http.parse(text);
            if ("error".equals(Json.text(json.path("status")))) {
                // Some errors arrive with HTTP 200 and the real status in the body.
                throw http.error(Objects.requireNonNullElse(Json.intNumber(json.path("code")), 400), text);
            }
            return json;
        });
        List<PriceBar> bars = new ArrayList<>();
        for (JsonNode value : body.path("values")) {
            String date = Json.text(value.path("datetime"));
            Double open = Json.number(value.path("open"));
            Double high = Json.number(value.path("high"));
            Double low = Json.number(value.path("low"));
            Double close = Json.number(value.path("close"));
            if (date == null || open == null || high == null || low == null || close == null) {
                continue;
            }
            Long volume = Json.longNumber(value.path("volume"));
            bars.add(new PriceBar(LocalDate.parse(date.substring(0, 10)), open, high, low, close,
                    volume == null ? 0 : volume));
        }
        return PriceBars.completedSessions(bars, Exchange.usSession(), clock.instant());
    }

    /** Plan restrictions come as 404 ("available starting with the Grow plan"), unknown symbols as 400/404. */
    static Kind kind(int status, String body) {
        String text = body.toLowerCase(Locale.ROOT);
        if ((status == 400 || status == 403 || status == 404) && (text.contains("plan") || text.contains("upgrad"))) {
            return Kind.UNSUPPORTED;
        }
        if ((status == 400 || status == 404) && text.contains("not found")) {
            return Kind.NOT_FOUND;
        }
        return ProviderHttp.DEFAULT_STATUS_MAPPER.kind(status, body);
    }
}
