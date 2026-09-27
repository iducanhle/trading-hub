package com.earningstracker.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.ReportTime;
import com.earningstracker.notification.DigestService;
import com.earningstracker.notification.MailTestSupport;
import com.earningstracker.notification.NotificationProperties;
import com.earningstracker.notification.UserDirectory;
import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.security.EmailAllowlist;
import com.earningstracker.security.SecurityProperties;
import com.earningstracker.security.UserAccounts;
import com.earningstracker.service.ServiceFixture;
import com.icegreen.greenmail.configuration.GreenMailConfiguration;
import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import jakarta.mail.Message;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

class EarningsDigestJobTest {

    @RegisterExtension
    static final GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.SMTP.dynamicPort())
            .withConfiguration(GreenMailConfiguration.aConfig()
                    .withUser(MailTestSupport.SENDER, MailTestSupport.APP_PASSWORD));

    // Sunday 2026-09-27 12:00 in Prague: "tomorrow" is Monday 2026-09-28.
    private final ServiceFixture f = new ServiceFixture();
    private final Map<String, AuthenticatedUser> accounts = new HashMap<>();
    private final UserAccounts userAccounts = uid -> Optional.ofNullable(accounts.get(uid));
    private final EmailAllowlist allowlist = new EmailAllowlist(
            new SecurityProperties(List.of("me@example.com", "friend@example.com"), List.of()));
    private DigestService digest;
    private EarningsDigestJob job;

    @BeforeEach
    void setUp() {
        digest = new DigestService(f.follows, f.earnings, f.profiles, MailTestSupport.templateEngine(),
                MailTestSupport.mailSender(greenMail.getSmtp().getPort()), MailTestSupport.properties());
        job = new EarningsDigestJob(new UserDirectory(f.store), userAccounts, allowlist, digest, f.store, f.clock);

        user("u1", "me@example.com", true, null);
        follow("u1", "NVDA", "NVIDIA Corporation", "https://logo.example/NVDA.png");
        follow("u1", "SAP.DE", "SAP SE", null);
        user("u2", "friend@example.com", true, Map.of("notifyDaysBefore", 3, "notificationEmail", "alerts@example.com"));
        follow("u2", "ASML.AS", "ASML Holding N.V.", null);
        follow("u2", "NVDA", "NVIDIA Corporation", null);
        user("u3", "stranger@example.com", true, null);
        follow("u3", "NVDA", "NVIDIA Corporation", null);
        user("u4", "me@example.com", true, Map.of("notificationsEnabled", false));
        follow("u4", "NVDA", "NVIDIA Corporation", null);

        reports("NVDA", "finnhub", report("NVDA", "2026-09-28", ReportTime.AMC, "USD", 1.05, 54.9e9),
                report("NVDA", "2026-08-27", ReportTime.AMC, "USD", 1.01, 46.9e9));
        reports("SAP.DE", "yahoo", report("SAP.DE", "2026-09-28", ReportTime.BMO, "EUR", 1.83, null));
        reports("ASML.AS", "yahoo", report("ASML.AS", "2026-09-30", ReportTime.UNKNOWN, "EUR", null, 7.5e9));
    }

    private void user(String uid, String email, boolean verified, Map<String, Object> settings) {
        accounts.put(uid, new AuthenticatedUser(uid, email, verified));
        f.store.set("users", uid, settings == null ? Map.of("email", email)
                : Map.of("email", email, "settings", settings));
    }

    private void follow(String uid, String symbol, String name, String logoUrl) {
        Map<String, Object> doc = new HashMap<>(Map.of("symbol", symbol, "name", name));
        if (logoUrl != null) {
            doc.put("logoUrl", logoUrl);
        }
        f.store.set("users/" + uid + "/follows", symbol, doc);
    }

    private void reports(String symbol, String source, EarningsReport... reports) {
        f.earnings.record(symbol, source, List.of(reports));
    }

    private static EarningsReport report(String symbol, String date, ReportTime time, String currency,
            Double epsEstimate, Double revenueEstimate) {
        boolean past = LocalDate.parse(date).isBefore(LocalDate.parse("2026-09-27"));
        return new EarningsReport(symbol, LocalDate.parse(date), time, null, null, null, currency, epsEstimate,
                past ? 1.1 : null, revenueEstimate, null, true);
    }

    private static List<String> recipients(MimeMessage message) throws Exception {
        return Arrays.stream(message.getRecipients(Message.RecipientType.TO)).map(Object::toString).toList();
    }

    @Test
    void sendsEachAllowedUserTheirStocksForTheirWindow() throws Exception {
        Map<String, Object> stats = job.run();

        assertThat(stats).containsEntry("users", 4).containsEntry("sent", 2).containsEntry("notAllowed", 1)
                .containsEntry("notificationsDisabled", 1).containsEntry("failed", 0);
        Map<String, MimeMessage> byRecipient = new HashMap<>();
        for (MimeMessage message : greenMail.getReceivedMessages()) {
            byRecipient.put(String.join(",", recipients(message)), message);
        }
        assertThat(byRecipient).containsOnlyKeys("me@example.com", "alerts@example.com");

        MimeMessage mine = byRecipient.get("me@example.com");
        assertThat(mine.getSubject()).isEqualTo("Earnings tomorrow: NVDA, SAP.DE");
        assertThat(((InternetAddress) mine.getFrom()[0]).getAddress()).isEqualTo(MailTestSupport.SENDER);
        assertThat(((InternetAddress) mine.getFrom()[0]).getPersonal()).isEqualTo("Earnings Tracker");
        Map<String, String> parts = MailTestSupport.parts(mine);
        assertThat(parts).containsKeys("text/plain", "text/html");
        assertThat(parts.get("text/html"))
                .contains("https://app.example.com/stock/NVDA", "https://app.example.com/stock/SAP.DE")
                .contains("NVIDIA Corporation", "After close", "Before open", "Mon, 28 Sep 2026")
                .contains("1.05 USD", "54.90B USD", "1.83 EUR")
                .contains("src=\"https://logo.example/NVDA.png\"", ">SS<") // SAP SE has no logo: initials
                .contains("https://app.example.com/settings")
                .doesNotContain("sample data");
        assertThat(parts.get("text/plain")).contains("NVDA · NVIDIA Corporation", "After close",
                "EPS est. 1.05 USD · Revenue est. 54.90B USD", "https://app.example.com/stock/SAP.DE");

        MimeMessage friends = byRecipient.get("alerts@example.com");
        assertThat(friends.getSubject()).isEqualTo("Upcoming earnings: NVDA, ASML.AS");
        assertThat(MailTestSupport.parts(friends).get("text/html")).contains("Time TBD", "7.50B EUR");

        assertThat(f.store.peek(EarningsDigestJob.LOG, "u1_2026-09-27")).get()
                .satisfies(log -> assertThat(log).containsEntry("sentTo", "me@example.com")
                        .containsEntry("symbols", List.of("NVDA", "SAP.DE")));
    }

    @Test
    void aRerunOnTheSameDaySendsNothingTwice() {
        job.run();

        Map<String, Object> stats = job.run();

        assertThat(stats).containsEntry("alreadySent", 2).containsEntry("sent", 0);
        assertThat(greenMail.getReceivedMessages()).hasSize(2);
    }

    @Test
    void sendsNothingWhenThereIsNothingToReport() {
        f.clock.advance(Duration.ofDays(1)); // Monday: NVDA and SAP.DE report today, ASML is still in u2's window

        Map<String, Object> stats = job.run();

        assertThat(stats).containsEntry("sent", 1).containsEntry("nothingUpcoming", 1);
        assertThat(greenMail.getReceivedMessages()).singleElement()
                .satisfies(m -> assertThat(m.getSubject()).isEqualTo("Upcoming earnings: ASML.AS"));
    }

    @Test
    void unverifiedAccountsGetNothing() {
        accounts.put("u1", new AuthenticatedUser("u1", "me@example.com", false));

        assertThat(job.run()).containsEntry("notAllowed", 2).containsEntry("sent", 1);
    }

    @Test
    void aFailedSendFailsTheRunAndIsRetriedByTheNextRun() {
        DigestService broken = new DigestService(f.follows, f.earnings, f.profiles, MailTestSupport.templateEngine(),
                MailTestSupport.mailSender(1), MailTestSupport.properties());
        EarningsDigestJob failing = new EarningsDigestJob(new UserDirectory(f.store), userAccounts, allowlist, broken,
                f.store, f.clock);

        assertThatThrownBy(failing::run).hasMessageStartingWith("2 digest(s) could not be sent (0 sent)");
        assertThat(f.store.peek(EarningsDigestJob.LOG, "u1_2026-09-27")).isEmpty();

        assertThat(job.run()).containsEntry("sent", 2);
    }

    @Test
    void doesNothingWithoutMailSettings() {
        DigestService unconfigured = new DigestService(f.follows, f.earnings, f.profiles,
                MailTestSupport.templateEngine(), MailTestSupport.mailSender(greenMail.getSmtp().getPort()),
                new NotificationProperties(null, null, "Earnings Tracker", "https://app.example.com"));

        assertThat(new EarningsDigestJob(new UserDirectory(f.store), userAccounts, allowlist, unconfigured, f.store,
                f.clock).run()).containsEntry("skipped", "mail is not configured");
        assertThat(greenMail.getReceivedMessages()).isEmpty();
    }
}
