package com.earningstracker.jobs;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import com.google.cloud.Timestamp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Runs jobs one at a time per job (a lock prevents overlapping runs) and records each run in
 * {@code jobRuns/{jobName}}: {@code lastStart}, {@code lastSuccess}, {@code lastError}, {@code stats} (including the
 * estimated Firestore reads and writes of the run).
 */
@Component
public class JobRunner {

    static final String COLLECTION = "jobRuns";
    private static final Logger log = LoggerFactory.getLogger(JobRunner.class);

    private final Map<String, Job> jobs;
    private final Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();
    private final Map<String, Instant> running = new ConcurrentHashMap<>();
    private final DocumentStore store;
    private final ExecutorService executor;
    private final Clock clock;

    public JobRunner(List<Job> jobs, DocumentStore store, ExecutorService executor, Clock clock) {
        this.jobs = jobs.stream().collect(Collectors.toMap(Job::name, Function.identity()));
        this.store = store;
        this.executor = executor;
        this.clock = clock;
    }

    /**
     * Starts a run in the background (manual or startup trigger). If the job is already running, returns that run's
     * start time instead of starting another one.
     */
    public Instant trigger(String name, String trigger) {
        Job job = job(name);
        Instant current = running.get(name);
        if (current != null) {
            return current;
        }
        Instant startedAt = clock.instant();
        executor.execute(() -> run(job, trigger, startedAt));
        return startedAt;
    }

    /** Runs now in the calling thread; empty if the job was already running or failed. */
    public Optional<Map<String, Object>> run(String name, String trigger) {
        return run(job(name), trigger, clock.instant());
    }

    /** When the job last finished successfully, from {@code jobRuns}. */
    public Optional<Instant> lastSuccess(String name) {
        try {
            return store.get(COLLECTION, name)
                    .map(doc -> doc.get("lastSuccess"))
                    .filter(Timestamp.class::isInstance)
                    .map(ts -> Instant.ofEpochSecond(((Timestamp) ts).getSeconds(), ((Timestamp) ts).getNanos()));
        } catch (RuntimeException e) {
            log.warn("Could not read the last run of {}: {}", name, e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<Map<String, Object>> run(Job job, String trigger, Instant start) {
        ReentrantLock lock = locks.computeIfAbsent(job.name(), n -> new ReentrantLock());
        if (!lock.tryLock()) {
            log.info("Job {} is already running; {} trigger skipped", job.name(), trigger);
            return Optional.empty();
        }
        running.put(job.name(), start);
        DocumentStore.Usage before = store.usage();
        record(job.name(), Map.of("lastStart", timestamp(start), "running", true, "trigger", trigger));
        log.info("Job {} started ({})", job.name(), trigger);
        try {
            Map<String, Object> stats = new LinkedHashMap<>(job.run());
            DocumentStore.Usage used = store.usage().minus(before); // includes the lastStart update
            Instant end = clock.instant();
            stats.put("durationSeconds", Duration.between(start, end).toSeconds());
            stats.put("firestoreReads", used.reads());
            stats.put("firestoreWrites", used.writes() + 1); // + the lastSuccess update below
            log.info("Job {} finished in {} s: {}", job.name(), stats.get("durationSeconds"), stats);
            record(job.name(), Map.of("lastSuccess", timestamp(end), "running", false, "lastResult", "success",
                    "stats", stats));
            return Optional.of(stats);
        } catch (RuntimeException e) {
            log.error("Job {} failed", job.name(), e);
            record(job.name(), Map.of("running", false, "lastResult", "failure", "lastError",
                    Map.of("at", timestamp(clock.instant()), "message", String.valueOf(e.getMessage()))));
            return Optional.empty();
        } finally {
            running.remove(job.name());
            lock.unlock();
        }
    }

    private Job job(String name) {
        Job job = jobs.get(name);
        if (job == null) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "Unknown job '" + name + "'; known jobs: " + jobs.keySet());
        }
        return job;
    }

    private void record(String name, Map<String, Object> fields) {
        try {
            store.merge(COLLECTION, name, fields);
        } catch (RuntimeException e) {
            log.warn("Could not record the run of {}: {}", name, e.getMessage());
        }
    }

    private static Timestamp timestamp(Instant instant) {
        return Timestamp.ofTimeSecondsAndNanos(instant.getEpochSecond(), instant.getNano());
    }
}
