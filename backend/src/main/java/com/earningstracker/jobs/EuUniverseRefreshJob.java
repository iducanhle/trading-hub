package com.earningstracker.jobs;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import com.earningstracker.service.EarningsService;
import com.earningstracker.service.ProfileService;
import com.earningstracker.universe.EuUniverse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Sunday 03:00 (§7): next earnings dates and market caps for the whole EU seed universe via Yahoo (its rate limiter
 * keeps this at ≤ 1 request per second). Symbols refreshed within the last 6 days are skipped, so a rerun after an
 * interruption continues where it stopped.
 */
@Component
public class EuUniverseRefreshJob implements Job {

    public static final String NAME = "eu-universe-refresh";
    static final Duration RESUME_AFTER = Duration.ofDays(6);
    private static final Logger log = LoggerFactory.getLogger(EuUniverseRefreshJob.class);

    private final EuUniverse universe;
    private final EarningsService earnings;
    private final ProfileService profiles;
    private final Clock clock;

    public EuUniverseRefreshJob(EuUniverse universe, EarningsService earnings, ProfileService profiles, Clock clock) {
        this.universe = universe;
        this.earnings = earnings;
        this.profiles = profiles;
        this.clock = clock;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public Map<String, Object> run() {
        Instant recent = clock.instant().minus(RESUME_AFTER);
        AtomicInteger unlimited = new AtomicInteger(Integer.MAX_VALUE);
        int refreshed = 0;
        int skipped = 0;
        int failures = 0;
        for (EuUniverse.Member member : universe.validMembers()) {
            String symbol = member.symbol();
            boolean fresh = earnings.stored(symbol).map(c -> c.fetchedAt().isAfter(recent)).orElse(false);
            if (fresh) {
                skipped++;
            } else {
                try {
                    earnings.refreshNow(symbol);
                    refreshed++;
                } catch (RuntimeException e) {
                    failures++;
                    log.info("Earnings of {} not refreshed: {}", symbol, e.getMessage());
                }
            }
            profiles.basics(symbol, RESUME_AFTER, unlimited); // weekly market cap
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("symbols", universe.validMembers().size());
        stats.put("refreshed", refreshed);
        stats.put("skipped", skipped);
        stats.put("failures", failures);
        return stats;
    }
}
