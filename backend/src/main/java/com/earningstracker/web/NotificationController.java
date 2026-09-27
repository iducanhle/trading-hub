package com.earningstracker.web;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.earningstracker.jobs.Job;
import com.earningstracker.notification.DigestService;
import com.earningstracker.notification.UserDirectory;
import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    public record TestEmailResponse(String sentTo) {
    }

    /** The test email looks this far ahead, so real followed stocks show up more often than in a 1-day digest. */
    static final int TEST_DAYS_AHEAD = 7;
    static final Duration MIN_INTERVAL = Duration.ofMinutes(1);
    private static final Logger log = LoggerFactory.getLogger(NotificationController.class);

    private final DigestService digest;
    private final UserDirectory users;
    private final Clock clock;
    private final Map<String, Instant> lastTest = new HashMap<>();

    public NotificationController(DigestService digest, UserDirectory users, Clock clock) {
        this.digest = digest;
        this.users = users;
        this.clock = clock;
    }

    /**
     * Sends a digest to the caller now (to {@code settings.notificationEmail} or the account email): their followed
     * stocks reporting in the next 7 days, or sample data if there are none. At most one per minute per user.
     */
    @PostMapping("/test")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public TestEmailResponse test(@AuthenticationPrincipal AuthenticatedUser user) {
        if (!digest.isConfigured()) {
            throw new ApiException(ErrorCode.UPSTREAM_UNAVAILABLE,
                    "Email is not configured on this server (MAIL_USERNAME / MAIL_APP_PASSWORD)");
        }
        if (!tryAcquire(user.uid(), clock.instant())) {
            throw new ApiException(ErrorCode.RATE_LIMITED, "One test email per minute; try again shortly");
        }

        UserDirectory.Settings settings = users.user(user.uid()).map(UserDirectory.User::settings)
                .orElse(UserDirectory.Settings.DEFAULTS);
        String to = settings.notificationEmail() != null ? settings.notificationEmail() : user.email();
        LocalDate today = LocalDate.now(clock.withZone(Job.ZONE));
        List<DigestService.Item> items = digest.upcoming(user.uid(), today.plusDays(1), today.plusDays(TEST_DAYS_AHEAD));
        boolean sample = items.isEmpty();
        List<DigestService.Item> shown = sample ? digest.samples(today) : items;
        try {
            digest.send(digest.compose(to, shown, today, sample, true));
        } catch (MailAuthenticationException e) {
            log.warn("Test email failed: the mail server rejected the credentials");
            throw new ApiException(ErrorCode.UPSTREAM_UNAVAILABLE,
                    "The mail server rejected the credentials; check MAIL_USERNAME and MAIL_APP_PASSWORD");
        } catch (MailException e) {
            log.warn("Test email failed: {}", e.getMessage());
            throw new ApiException(ErrorCode.UPSTREAM_UNAVAILABLE, "The email could not be sent; try again later");
        }
        log.info("Test email sent for user {} ({} events{})", user.uid(), shown.size(), sample ? ", sample data" : "");
        return new TestEmailResponse(to);
    }

    private synchronized boolean tryAcquire(String uid, Instant now) {
        Instant previous = lastTest.get(uid);
        if (previous != null && previous.plus(MIN_INTERVAL).isAfter(now)) {
            return false;
        }
        lastTest.put(uid, now);
        return true;
    }
}
