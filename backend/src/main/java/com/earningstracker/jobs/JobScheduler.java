package com.earningstracker.jobs;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** The §7 schedules (Europe/Prague) and the startup calendar refresh. Disabled with {@code app.jobs.enabled=false}. */
@Component
@EnableScheduling
@ConditionalOnBooleanProperty(name = "app.jobs.enabled", matchIfMissing = true)
class JobScheduler {

    static final Duration STARTUP_REFRESH_AFTER = Duration.ofHours(24);
    private static final Logger log = LoggerFactory.getLogger(JobScheduler.class);

    private final JobRunner runner;
    private final Clock clock;

    JobScheduler(JobRunner runner, Clock clock) {
        this.runner = runner;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 6 * * *", zone = "Europe/Prague")
    void calendarRefresh() {
        runner.run(CalendarRefreshJob.NAME, "schedule");
    }

    @Scheduled(cron = "0 30 6 * * *", zone = "Europe/Prague")
    void marketEventsRefresh() {
        runner.run(MarketEventsRefreshJob.NAME, "schedule");
    }

    @Scheduled(cron = "0 0 3 * * SUN", zone = "Europe/Prague")
    void euUniverseRefresh() {
        runner.run(EuUniverseRefreshJob.NAME, "schedule");
    }

    @Scheduled(cron = "0 30 23 * * *", zone = "Europe/Prague")
    void pricesRefresh() {
        runner.run(PricesRefreshJob.NAME, "schedule");
    }

    @Scheduled(cron = "0 0 20 * * SUN", zone = "Europe/Prague")
    void earningsDigest() {
        runner.run(EarningsDigestJob.NAME, "schedule");
    }

    /** Trading 212: every {@code app.t212.sync-interval}, first 15 minutes after startup. */
    @Scheduled(fixedDelayString = "${app.t212.sync-interval}", initialDelayString = "PT15M")
    void trading212Sync() {
        runner.run(T212SyncJob.NAME, "schedule");
    }

    /** Trading 212 balance history: on the hour and every 5 minutes after it (9:00, 9:05, 9:10 …). */
    @Scheduled(cron = "0 0/5 * * * *", zone = "Europe/Prague")
    void trading212Snapshot() {
        runner.run(T212SnapshotJob.NAME, "schedule");
    }

    /** §7: run calendar-refresh once on startup if its last success is older than 24 h. */
    @EventListener(ApplicationReadyEvent.class)
    void onStartup() {
        Instant last = runner.lastSuccess(CalendarRefreshJob.NAME).orElse(Instant.EPOCH);
        if (last.isBefore(clock.instant().minus(STARTUP_REFRESH_AFTER))) {
            log.info("calendar-refresh last succeeded at {}; running it now", last);
            runner.trigger(CalendarRefreshJob.NAME, "startup");
        }
        Instant lastEvents = runner.lastSuccess(MarketEventsRefreshJob.NAME).orElse(Instant.EPOCH);
        if (lastEvents.isBefore(clock.instant().minus(STARTUP_REFRESH_AFTER))) {
            log.info("market-events-refresh last succeeded at {}; running it now", lastEvents);
            runner.trigger(MarketEventsRefreshJob.NAME, "startup");
        }
    }
}
