package com.earningstracker.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.earningstracker.cache.DocumentStore;
import com.earningstracker.cache.InMemoryDocumentStore;
import com.earningstracker.jobs.Job;
import com.earningstracker.market.EarningsReport;
import com.earningstracker.market.ReportTime;
import com.earningstracker.notification.MailTestSupport;
import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.security.TokenVerifier;
import com.earningstracker.service.EarningsService;
import com.icegreen.greenmail.configuration.GreenMailConfiguration;
import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

/** {@code POST /api/notifications/test} through the real mail and template auto-configuration, into GreenMail. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TestEmailIntegrationTest {

    @RegisterExtension
    static final GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.SMTP.dynamicPort())
            .withConfiguration(GreenMailConfiguration.aConfig()
                    .withUser(MailTestSupport.SENDER, MailTestSupport.APP_PASSWORD))
            .withPerMethodLifecycle(false);

    /** The same variables production sets, so the {@code spring.mail} mapping in application.yml is covered. */
    @DynamicPropertySource
    static void mail(DynamicPropertyRegistry registry) {
        registry.add("MAIL_HOST", () -> "127.0.0.1");
        registry.add("MAIL_PORT", () -> greenMail.getSmtp().getPort());
        registry.add("MAIL_STARTTLS", () -> "false");
        registry.add("MAIL_USERNAME", () -> MailTestSupport.SENDER);
        registry.add("MAIL_APP_PASSWORD", () -> MailTestSupport.APP_PASSWORD);
    }

    @Autowired
    private MockMvcTester mvc;
    @Autowired
    private EarningsService earnings;
    @MockitoBean
    private TokenVerifier tokenVerifier;
    @TestBean
    private DocumentStore documentStore;

    static DocumentStore documentStore() {
        return new InMemoryDocumentStore();
    }

    @BeforeEach
    void clearMailbox() throws Exception {
        greenMail.purgeEmailFromAllMailboxes();
    }

    private MockMvcTester.MockMvcRequestBuilder sendTest(String uid, String email) {
        given(tokenVerifier.verify(uid)).willReturn(new AuthenticatedUser(uid, email, true));
        return mvc.post().uri("/api/notifications/test").header(HttpHeaders.AUTHORIZATION, "Bearer " + uid);
    }

    @Test
    void sendsTheCallersFollowedStocks() throws Exception {
        LocalDate inTwoDays = LocalDate.now(Job.ZONE).plusDays(2);
        documentStore.set("users/uid-1/follows", "NVDA", Map.of("symbol", "NVDA", "name", "NVIDIA Corporation"));
        earnings.record("NVDA", "finnhub", List.of(new EarningsReport("NVDA", inTwoDays, ReportTime.AMC, null, 3,
                2027, "USD", 1.05, null, 54.9e9, null, true)));

        assertThat(sendTest("uid-1", "me@example.com")).hasStatus(HttpStatus.ACCEPTED).bodyJson()
                .isStrictlyEqualTo("{\"sentTo\":\"me@example.com\"}");

        MimeMessage message = greenMail.getReceivedMessages()[0];
        assertThat(message.getSubject()).isEqualTo("[Test] Upcoming earnings: NVDA");
        assertThat(MailTestSupport.parts(message).get("text/html"))
                .contains("NVIDIA Corporation", "After close", "1.05 USD", "https://app.example.com/stock/NVDA")
                .doesNotContain("sample data");
    }

    @Test
    void sendsSampleDataToTheNotificationEmailWhenNothingIsUpcoming() throws Exception {
        documentStore.set("users", "uid-2", Map.of("email", "friend@example.com",
                "settings", Map.of("notificationEmail", "alerts@example.com")));

        assertThat(sendTest("uid-2", "friend@example.com")).hasStatus(HttpStatus.ACCEPTED).bodyJson()
                .isStrictlyEqualTo("{\"sentTo\":\"alerts@example.com\"}");

        assertThat(greenMail.getReceivedMessages()).singleElement().satisfies(message -> {
            assertThat(message.getAllRecipients()[0].toString()).isEqualTo("alerts@example.com");
            assertThat(message.getSubject()).isEqualTo("[Test] Upcoming earnings: NVDA, SAP.DE");
            assertThat(MailTestSupport.parts(message).get("text/plain")).contains("sample data", "SAP SE (sample)");
        });
    }

    @Test
    void allowsOneTestEmailPerMinute() {
        assertThat(sendTest("uid-3", "me@example.com")).hasStatus(HttpStatus.ACCEPTED);

        assertThat(sendTest("uid-3", "me@example.com")).hasStatus(HttpStatus.TOO_MANY_REQUESTS)
                .bodyJson().extractingPath("$.code").isEqualTo("RATE_LIMITED");
        assertThat(greenMail.getReceivedMessages()).hasSize(1);
    }
}
