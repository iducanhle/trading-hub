package com.earningstracker.jobs;

import java.time.Clock;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.earningstracker.market.EarningsReport;
import com.earningstracker.service.EarningsService;
import com.earningstracker.service.PriceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Daily 23:30 (§7), after the US close: new daily bars for followed and recently viewed symbols, and a fresh
 * earnings fetch for those with a report in the last 7 days that still has no actual.
 */
@Component
public class PricesRefreshJob implements Job {

    public static final String NAME = "prices-refresh";
    static final int ACTUALS_LOOKBACK_DAYS = 7;
    private static final Logger log = LoggerFactory.getLogger(PricesRefreshJob.class);

    private final TrackedSymbols tracked;
    private final PriceService prices;
    private final EarningsService earnings;
    private final Clock clock;

    public PricesRefreshJob(TrackedSymbols tracked, PriceService prices, EarningsService earnings, Clock clock) {
        this.tracked = tracked;
        this.prices = prices;
        this.earnings = earnings;
        this.clock = clock;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public Map<String, Object> run() {
        LocalDate today = LocalDate.now(clock.withZone(ZONE));
        int priced = 0;
        int failures = 0;
        int actualsRefreshed = 0;
        var symbols = tracked.all();
        for (String symbol : symbols) {
            try {
                prices.bars(symbol);
                priced++;
            } catch (RuntimeException e) {
                failures++;
                log.info("Prices of {} not refreshed: {}", symbol, e.getMessage());
            }
            List<EarningsReport> stored = earnings.stored(symbol).map(c -> c.value()).orElse(List.of());
            boolean missingActual = stored.stream().anyMatch(r -> r.date() != null && r.epsActual() == null
                    && !r.date().isAfter(today) && !r.date().isBefore(today.minusDays(ACTUALS_LOOKBACK_DAYS)));
            if (missingActual) {
                try {
                    earnings.refreshNow(symbol);
                    actualsRefreshed++;
                } catch (RuntimeException e) {
                    log.info("Actuals of {} not refreshed: {}", symbol, e.getMessage());
                }
            }
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("symbols", symbols.size());
        stats.put("priced", priced);
        stats.put("failures", failures);
        stats.put("actualsRefreshed", actualsRefreshed);
        return stats;
    }
}
