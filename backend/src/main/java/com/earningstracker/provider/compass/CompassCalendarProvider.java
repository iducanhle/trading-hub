package com.earningstracker.provider.compass;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.earningstracker.market.EventCategory;
import com.earningstracker.market.Importance;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.http.ProviderHttp;
import com.earningstracker.provider.http.ProviderHttpFactory;
import com.earningstracker.web.dto.Dtos;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * US market-moving dates from the Compass Economic Calendar (FOMC, CPI, jobs, GDP, PCE, ISM, Treasury refunding and
 * auctions, options and futures expiry, market holidays): one JSON file, rebuilt weekly from federalreserve.gov, FRED
 * and TreasuryDirect, covering about 13 months ahead. A community project without a guarantee, so the daily job
 * keeps what it stored when the feed is unavailable. Forecast and actual values are not part of it.
 */
@Component
public class CompassCalendarProvider {

    public static final String ID = "compass";

    /** The feed's own coverage window: days inside it are replaced, days outside it are left alone. */
    public record Feed(LocalDate windowStart, LocalDate windowEnd, List<Dtos.MarketEvent> events) {
    }

    /** Compass {@code event_type} → short label and category; unknown types become market-structure events. */
    private record EventType(String label, EventCategory category) {
    }

    private static final Map<String, EventType> TYPES = Map.ofEntries(
            Map.entry("fomc_meeting_day_1", new EventType("FOMC", EventCategory.CENTRAL_BANK)),
            Map.entry("fomc_statement", new EventType("FOMC", EventCategory.CENTRAL_BANK)),
            Map.entry("fomc_press_conference", new EventType("Fed Chair", EventCategory.CENTRAL_BANK)),
            Map.entry("fomc_sep", new EventType("Dot plot", EventCategory.CENTRAL_BANK)),
            Map.entry("macro_release_cpi", new EventType("CPI", EventCategory.INFLATION)),
            Map.entry("macro_release_ppi", new EventType("PPI", EventCategory.INFLATION)),
            Map.entry("macro_release_pce", new EventType("PCE", EventCategory.INFLATION)),
            Map.entry("macro_release_employment_situation", new EventType("Jobs", EventCategory.JOBS)),
            Map.entry("macro_release_jolts", new EventType("JOLTS", EventCategory.JOBS)),
            Map.entry("macro_release_jobless_claims", new EventType("Claims", EventCategory.JOBS)),
            Map.entry("macro_release_gdp", new EventType("GDP", EventCategory.GROWTH)),
            Map.entry("macro_release_retail_sales", new EventType("Retail", EventCategory.GROWTH)),
            Map.entry("macro_release_factory_orders", new EventType("Orders", EventCategory.GROWTH)),
            Map.entry("ism_manufacturing_pmi", new EventType("ISM Mfg", EventCategory.GROWTH)),
            Map.entry("ism_services_pmi", new EventType("ISM Svc", EventCategory.GROWTH)),
            Map.entry("treasury_auction", new EventType("Auction", EventCategory.TREASURY)),
            Map.entry("treasury_quarterly_refunding", new EventType("Refunding", EventCategory.TREASURY)),
            Map.entry("monthly_opex", new EventType("OPEX", EventCategory.MARKET_STRUCTURE)),
            Map.entry("quad_witching", new EventType("Witching", EventCategory.MARKET_STRUCTURE)),
            Map.entry("futures_expiration", new EventType("Futures", EventCategory.MARKET_STRUCTURE)),
            Map.entry("futures_liquidity_roll", new EventType("Roll", EventCategory.MARKET_STRUCTURE)),
            Map.entry("futures_official_roll", new EventType("Roll", EventCategory.MARKET_STRUCTURE)),
            Map.entry("market_holiday", new EventType("Closed", EventCategory.MARKET_STRUCTURE)),
            Map.entry("market_early_close", new EventType("Early close", EventCategory.MARKET_STRUCTURE)));

    private final ProviderHttp http;

    public CompassCalendarProvider(CompassProperties properties, ProviderHttpFactory httpFactory) {
        this.http = httpFactory.create(ID, properties.baseUrl(), properties.minInterval(), 0, null, null, builder -> {
        });
    }

    public Feed fetch() {
        JsonNode root = http.getJson("/calendar.json");
        JsonNode events = root.path("events");
        String start = Json.text(root.path("window").path("start"));
        String end = Json.text(root.path("window").path("end"));
        if (!events.isArray() || start == null || end == null) {
            throw new ProviderException(ID, Kind.BAD_RESPONSE, "not a Compass calendar");
        }
        List<Dtos.MarketEvent> result = new ArrayList<>();
        for (JsonNode node : events) {
            Dtos.MarketEvent event = event(node);
            if (event != null) {
                result.add(event);
            }
        }
        return new Feed(LocalDate.parse(start), LocalDate.parse(end), result);
    }

    private static Importance importance(String impact) {
        if (impact == null) {
            return null;
        }
        try {
            return Importance.valueOf(impact.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static Dtos.MarketEvent event(JsonNode node) {
        String id = Json.text(node.path("id"));
        String date = Json.text(node.path("date_et"));
        String title = Json.text(node.path("title"));
        String impact = Json.text(node.path("market_impact"));
        Importance importance = importance(impact);
        if (id == null || date == null || title == null || importance == null) {
            return null;
        }
        String typeKey = Json.text(node.path("event_type"));
        EventType type = typeKey == null ? null : TYPES.get(typeKey);
        if (type == null) {
            type = new EventType(title, EventCategory.MARKET_STRUCTURE);
        }
        boolean allDay = node.path("all_day").asBoolean(false);
        String startUtc = Json.text(node.path("start_utc"));
        Instant startsAt = allDay || startUtc == null ? null : Instant.parse(startUtc);
        return new Dtos.MarketEvent("compass-" + id, LocalDate.parse(date), startsAt, startsAt == null, title,
                type.label(), type.category(), "US", importance,
                Json.text(node.path("note")), Json.number(node.path("typical_move").path("spx").path("ratio")),
                Json.text(node.path("source_url")), null, null, null);
    }
}
