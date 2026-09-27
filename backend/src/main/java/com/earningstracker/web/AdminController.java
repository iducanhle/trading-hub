package com.earningstracker.web;

import java.time.Instant;

import com.earningstracker.jobs.JobRunner;
import com.earningstracker.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Manual job triggers. Every allowlisted user may use them (the app has two users). */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    public record JobStarted(String jobName, Instant startedAt) {
    }

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);

    private final JobRunner jobs;

    public AdminController(JobRunner jobs) {
        this.jobs = jobs;
    }

    /**
     * Starts the job in the background and returns at once; the outcome lands in {@code jobRuns/{jobName}}. When the
     * job is already running, {@code startedAt} is the start of that run and no second run starts.
     */
    @PostMapping("/jobs/{jobName}/run")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public JobStarted run(@PathVariable String jobName, @AuthenticationPrincipal AuthenticatedUser user) {
        Instant startedAt = jobs.trigger(jobName, "manual");
        log.info("Job {} triggered by user {}", jobName, user.uid());
        return new JobStarted(jobName, startedAt);
    }
}
