package com.earningstracker.jobs;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param enabled                schedules and the startup run (off in tests)
 * @param maxProfileCallsPerRun  profile enrichment budget of calendar-refresh (§7: at most 1,500)
 * @param profileCacheAge        calendar enrichment reuses stored profiles younger than this (§7: 30 days)
 * @param calendarDaysBack       calendar window start, days before today (§7: 14)
 * @param calendarDaysAhead      calendar window end, days after today (§7: 45)
 * @param viewedWindow           recently viewed symbols are tracked for this long (§4: 30 days)
 */
@ConfigurationProperties("app.jobs")
public record JobProperties(boolean enabled, int maxProfileCallsPerRun, Duration profileCacheAge,
        int calendarDaysBack, int calendarDaysAhead, Duration viewedWindow) {
}
