package com.earningstracker.provider.finnhub;

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
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * Finnhub's EPS surprises ({@code /stock/earnings}, last 4 quarters): fiscal period and EPS but no report date.
 * Kept apart from the Finnhub calendar so the chain can rank it after FMP and Yahoo: the spec prefers "Finnhub
 * calendar → FMP → Yahoo", and these actuals sometimes disagree with the other two. Shares Finnhub's rate limit.
 */
@Component
public class FinnhubEpsProvider implements EarningsProvider {

    public static final String ID = "finnhub-eps";

    private final FinnhubProvider finnhub;

    public FinnhubEpsProvider(FinnhubProvider finnhub) {
        this.finnhub = finnhub;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public boolean isEnabled() {
        return finnhub.isEnabled();
    }

    @Override
    public List<EarningsReport> earnings(String symbol) {
        if (Symbols.region(symbol) != Region.US) {
            throw new ProviderException(ID, Kind.UNSUPPORTED, "free tier covers US symbols only");
        }
        List<EarningsReport> reports = new ArrayList<>();
        for (JsonNode row : finnhub.http().getJson("/stock/earnings?symbol={s}", Symbols.toDotClass(symbol))) {
            String period = Json.text(row.path("period"));
            reports.add(new EarningsReport(symbol, null, ReportTime.UNKNOWN,
                    period == null || period.length() < 10 ? null : LocalDate.parse(period.substring(0, 10)),
                    Json.intNumber(row.path("quarter")), Json.intNumber(row.path("year")), "USD",
                    Json.number(row.path("estimate")), Json.number(row.path("actual")), null, null, null));
        }
        return reports;
    }
}
