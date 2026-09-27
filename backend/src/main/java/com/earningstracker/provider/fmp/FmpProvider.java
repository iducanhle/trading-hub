package com.earningstracker.provider.fmp;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.Region;
import com.earningstracker.market.ReportTime;
import com.earningstracker.market.Symbols;
import com.earningstracker.provider.EarningsProvider;
import com.earningstracker.provider.ProviderException;
import com.earningstracker.provider.ProviderException.Kind;
import com.earningstracker.provider.http.Json;
import com.earningstracker.provider.http.ProviderHttp;
import com.earningstracker.provider.http.ProviderHttpFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;

/**
 * FMP stable API, historical US earnings: report dates with EPS and revenue, estimate vs actual. The free tier
 * covers only some US symbols (others answer 402) and no report times. The key goes in a header, never in URLs.
 */
@Component
public class FmpProvider implements EarningsProvider {

    public static final String ID = "fmp";
    /** Enough history for 12 quarters plus margin. */
    private static final int YEARS_BACK = 5;

    private final ProviderHttp http;
    private final Clock clock;
    private final boolean enabled;

    public FmpProvider(FmpProperties properties, ProviderHttpFactory httpFactory, Clock clock) {
        this.enabled = StringUtils.hasText(properties.apiKey());
        String apiKey = enabled ? properties.apiKey() : "";
        this.http = httpFactory.create(ID, properties.baseUrl(), properties.minInterval(), properties.dailyLimit(),
                null, null, builder -> builder.defaultHeader("apikey", apiKey));
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
    public List<EarningsReport> earnings(String symbol) {
        if (Symbols.region(symbol) != Region.US) {
            throw new ProviderException(ID, Kind.UNSUPPORTED, "free tier covers US symbols only");
        }
        LocalDate cutoff = LocalDate.now(clock).minusYears(YEARS_BACK);
        List<EarningsReport> reports = new ArrayList<>();
        for (JsonNode row : http.getJson("/earnings?symbol={s}", symbol)) {
            String date = Json.text(row.path("date"));
            if (date == null || LocalDate.parse(date.substring(0, 10)).isBefore(cutoff)) {
                continue;
            }
            reports.add(new EarningsReport(symbol, LocalDate.parse(date.substring(0, 10)), ReportTime.UNKNOWN,
                    null, null, null, "USD", Json.number(row.path("epsEstimated")), Json.number(row.path("epsActual")),
                    Json.number(row.path("revenueEstimated")), Json.number(row.path("revenueActual")), null));
        }
        return reports;
    }
}
