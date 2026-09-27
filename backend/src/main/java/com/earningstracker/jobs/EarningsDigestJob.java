package com.earningstracker.jobs;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.notification.DigestService;
import com.earningstracker.notification.UserDirectory;
import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.security.EmailAllowlist;
import com.earningstracker.security.UserAccounts;
import com.google.cloud.Timestamp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Component;

/**
 * Daily 12:00 (§8). Each user with notifications on, still allowlisted and verified, gets one email listing their
 * followed stocks that report in {@code [today+1, today+notifyDaysBefore]}, and only when there is at least one.
 * {@code notificationLog/{uid}_{date}} makes reruns on the same day skip users who already got theirs.
 */
@Component
public class EarningsDigestJob implements Job {

    public static final String NAME = "earnings-digest";
    static final String LOG = "notificationLog";
    private static final Logger log = LoggerFactory.getLogger(EarningsDigestJob.class);

    private final UserDirectory users;
    private final UserAccounts accounts;
    private final EmailAllowlist allowlist;
    private final DigestService digest;
    private final DocumentStore store;
    private final Clock clock;

    public EarningsDigestJob(UserDirectory users, UserAccounts accounts, EmailAllowlist allowlist,
            DigestService digest, DocumentStore store, Clock clock) {
        this.users = users;
        this.accounts = accounts;
        this.allowlist = allowlist;
        this.digest = digest;
        this.store = store;
        this.clock = clock;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public Map<String, Object> run() {
        if (!digest.isConfigured()) {
            log.warn("Skipping the digest: MAIL_USERNAME / MAIL_APP_PASSWORD are not set");
            return Map.of("skipped", "mail is not configured");
        }
        LocalDate today = LocalDate.now(clock.withZone(ZONE));
        int users = 0;
        int disabled = 0;
        int notAllowed = 0;
        int alreadySent = 0;
        int nothingUpcoming = 0;
        int sent = 0;
        int failed = 0;
        String lastFailure = null;
        for (UserDirectory.User user : this.users.users()) {
            users++;
            if (!user.settings().notificationsEnabled()) {
                disabled++;
                continue;
            }
            Optional<AuthenticatedUser> account = accounts.find(user.uid())
                    .filter(a -> a.emailVerified() && allowlist.isAllowed(a.email()));
            if (account.isEmpty()) {
                notAllowed++;
                continue;
            }
            String logId = user.uid() + "_" + today;
            if (store.get(LOG, logId).isPresent()) {
                alreadySent++;
                continue;
            }
            List<DigestService.Item> items = digest.upcoming(user.uid(), today.plusDays(1),
                    today.plusDays(user.settings().notifyDaysBefore()));
            if (items.isEmpty()) {
                nothingUpcoming++;
                continue;
            }
            String to = user.settings().notificationEmail() != null ? user.settings().notificationEmail()
                    : account.get().email();
            DigestService.Message message = digest.compose(to, items, today, false, false);
            try {
                digest.send(message);
            } catch (MailException e) {
                failed++;
                lastFailure = e.getMessage();
                log.warn("Digest for {} could not be sent: {}", user.uid(), e.getMessage());
                continue;
            }
            sent++;
            Instant now = clock.instant();
            store.set(LOG, logId, Map.of(
                    "uid", user.uid(),
                    "date", today.toString(),
                    "sentAt", Timestamp.ofTimeSecondsAndNanos(now.getEpochSecond(), now.getNano()),
                    "sentTo", to,
                    "symbols", items.stream().map(DigestService.Item::symbol).distinct().toList()));
            log.info("Digest sent to user {} ({} events)", user.uid(), items.size());
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("users", users);
        stats.put("notificationsDisabled", disabled);
        stats.put("notAllowed", notAllowed);
        stats.put("alreadySent", alreadySent);
        stats.put("nothingUpcoming", nothingUpcoming);
        stats.put("sent", sent);
        stats.put("failed", failed);
        if (failed > 0) {
            // Recorded as the run's lastError; a rerun sends only the missing digests.
            throw new IllegalStateException(failed + " digest(s) could not be sent (" + sent + " sent): " + lastFailure);
        }
        return stats;
    }
}
