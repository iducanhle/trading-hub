package com.earningstracker.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import com.earningstracker.cache.InMemoryDocumentStore;
import com.earningstracker.service.ServiceFixture.MutableClock;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import com.google.cloud.Timestamp;
import com.google.common.util.concurrent.MoreExecutors;
import org.junit.jupiter.api.Test;

class JobRunnerTest {

    private final InMemoryDocumentStore store = new InMemoryDocumentStore();
    private final MutableClock clock = new MutableClock(Instant.parse("2026-09-28T04:00:00Z"));

    private static Job job(String name, Supplier<Map<String, Object>> body) {
        return new Job() {
            @Override
            public String name() {
                return name;
            }

            @Override
            public Map<String, Object> run() {
                return body.get();
            }
        };
    }

    private JobRunner runner(ExecutorService executor, Job... jobs) {
        return new JobRunner(List.of(jobs), store, executor, clock);
    }

    @Test
    void recordsASuccessfulRunWithItsStatsAndFirestoreUsage() {
        JobRunner runner = runner(MoreExecutors.newDirectExecutorService(), job("demo", () -> {
            store.get("symbols", "AAPL");
            store.set("symbols", "AAPL", Map.of("name", "Apple"));
            clock.advance(Duration.ofSeconds(42));
            return Map.of("items", 3);
        }));

        Map<String, Object> stats = runner.run("demo", "manual").orElseThrow();

        assertThat(stats).containsEntry("items", 3).containsEntry("durationSeconds", 42L)
                .containsEntry("firestoreReads", 1L).containsEntry("firestoreWrites", 3L); // 1 + both jobRuns updates
        Map<String, Object> run = store.peek(JobRunner.COLLECTION, "demo").orElseThrow();
        assertThat(run).containsEntry("running", false).containsEntry("lastResult", "success")
                .containsEntry("trigger", "manual").containsEntry("stats", stats)
                .containsEntry("lastStart", Timestamp.parseTimestamp("2026-09-28T04:00:00Z"))
                .containsEntry("lastSuccess", Timestamp.parseTimestamp("2026-09-28T04:00:42Z"));
        assertThat(runner.lastSuccess("demo")).contains(Instant.parse("2026-09-28T04:00:42Z"));
    }

    @Test
    void recordsAFailureAndKeepsTheLastSuccess() {
        AtomicInteger calls = new AtomicInteger();
        JobRunner runner = runner(MoreExecutors.newDirectExecutorService(), job("flaky", () -> {
            if (calls.incrementAndGet() > 1) {
                throw new IllegalStateException("provider down");
            }
            return Map.of();
        }));
        runner.run("flaky", "schedule");
        clock.advance(Duration.ofDays(1));

        assertThat(runner.run("flaky", "schedule")).isEmpty();

        Map<String, Object> run = store.peek(JobRunner.COLLECTION, "flaky").orElseThrow();
        assertThat(run).containsEntry("running", false).containsEntry("lastResult", "failure")
                .containsEntry("lastError", Map.of("at", Timestamp.parseTimestamp("2026-09-29T04:00:00Z"),
                        "message", "provider down"));
        assertThat(runner.lastSuccess("flaky")).contains(Instant.parse("2026-09-28T04:00:00Z"));
    }

    @Test
    void neverRunsTheSameJobTwiceAtOnce() throws InterruptedException {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger runs = new AtomicInteger();
        ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
        JobRunner runner = runner(executor, job("slow", () -> {
            runs.incrementAndGet();
            started.countDown();
            try {
                release.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return Map.of();
        }));

        Instant first = runner.trigger("slow", "manual");
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
        clock.advance(Duration.ofMinutes(1));

        assertThat(runner.trigger("slow", "manual")).as("start of the running run").isEqualTo(first);
        assertThat(runner.run("slow", "schedule")).as("scheduled run while running").isEmpty();
        release.countDown();
        executor.shutdown();
        assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        assertThat(runs).hasValue(1);
        assertThat(runner.run("slow", "schedule")).as("next run after it finished").isPresent();
    }

    @Test
    void unknownJobsAreBadRequests() {
        JobRunner runner = runner(MoreExecutors.newDirectExecutorService(), job("demo", Map::of));

        assertThatThrownBy(() -> runner.trigger("nope", "manual"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.code()).isEqualTo(ErrorCode.BAD_REQUEST);
                    assertThat(e.getMessage()).contains("nope", "demo");
                });
    }
}
