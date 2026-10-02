package com.earningstracker.web;

import static com.earningstracker.provider.ProviderTestSupport.body;
import static com.earningstracker.provider.ProviderTestSupport.json;
import static com.earningstracker.provider.t212.T212TestSupport.API_KEY;
import static com.earningstracker.provider.t212.T212TestSupport.API_SECRET;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import java.io.IOException;

import com.earningstracker.provider.ProviderTestSupport.Routes;
import com.earningstracker.provider.t212.T212TestSupport;
import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.security.TokenVerifier;
import mockwebserver3.MockWebServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class T212ControllerTest {

    private static final MockWebServer SERVER = new MockWebServer();
    private static final Routes ROUTES = new Routes();
    private static final String BODY = "{\"apiKey\":\"" + API_KEY + "\",\"apiSecret\":\"" + API_SECRET
            + "\",\"environment\":\"DEMO\"}";

    @Autowired
    private MockMvcTester mvc;
    @MockitoBean
    private TokenVerifier tokenVerifier;

    @DynamicPropertySource
    static void trading212(DynamicPropertyRegistry registry) throws IOException {
        SERVER.setDispatcher(ROUTES);
        SERVER.start();
        String url = SERVER.url("/").toString().replaceAll("/$", "");
        registry.add("app.t212.encryption-key", () -> T212TestSupport.MASTER_KEY);
        registry.add("app.t212.demo-url", () -> url);
        registry.add("app.t212.live-url", () -> url);
        registry.add("app.t212.server-ip-hint", () -> "203.0.113.7");
    }

    @AfterAll
    static void stopServer() {
        SERVER.close();
    }

    @BeforeEach
    void signIn() {
        given(tokenVerifier.verify("alice")).willReturn(new AuthenticatedUser("uid-alice", "me@example.com", true));
        given(tokenVerifier.verify("bob")).willReturn(new AuthenticatedUser("uid-bob", "friend@example.com", true));
        ROUTES.on("/api/v0/equity/account/summary", json("t212/account-summary.json"))
                .on("/api/v0/equity/positions", json("t212/positions.json"))
                .on("/api/v0/equity/history/orders", json("t212/empty-page.json"))
                .on("/api/v0/equity/history/dividends", json("t212/empty-page.json"))
                .on("/api/v0/equity/history/transactions", json("t212/empty-page.json"));
    }

    private MvcTestResult put(String token, String body) {
        return mvc.put().uri("/api/t212/credentials").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body).exchange();
    }

    private MvcTestResult get(String token, String uri) {
        return mvc.get().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
    }

    @Test
    void requiresSignIn() {
        assertThat(mvc.get().uri("/api/t212/status")).hasStatus(HttpStatus.UNAUTHORIZED);
        assertThat(mvc.put().uri("/api/t212/credentials").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .hasStatus(HttpStatus.UNAUTHORIZED);
        assertThat(mvc.delete().uri("/api/t212/credentials")).hasStatus(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void connectsShowsOnlyAHintAndKeepsUsersApart() throws Exception {
        MvcTestResult saved = put("alice", BODY);
        assertThat(saved).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"connected":true,"environment":"DEMO","keyHint":"WXYZ","accountCurrency":"EUR",
                 "credentialsValid":true,"syncState":"RUNNING","lastError":null,"serverIpHint":"203.0.113.7"}
                """);
        assertThat(saved.getResponse().getContentAsString()).doesNotContain(API_KEY, API_SECRET);

        assertThat(get("bob", "/api/t212/status")).hasStatusOk().bodyJson().extractingPath("$.connected")
                .isEqualTo(false);
        assertThat(get("alice", "/api/t212/status")).hasStatusOk().bodyJson().extractingPath("$.connected")
                .isEqualTo(true);

        assertThat(mvc.delete().uri("/api/t212/credentials").header(HttpHeaders.AUTHORIZATION, "Bearer bob"))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(get("alice", "/api/t212/status")).bodyJson().extractingPath("$.connected").isEqualTo(true);

        assertThat(mvc.delete().uri("/api/t212/credentials").header(HttpHeaders.AUTHORIZATION, "Bearer alice"))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(get("alice", "/api/t212/status")).bodyJson().extractingPath("$.connected").isEqualTo(false);
    }

    @Test
    void syncNeedsAConnectionAndAnswers202() {
        assertThat(mvc.post().uri("/api/t212/sync").header(HttpHeaders.AUTHORIZATION, "Bearer bob"))
                .hasStatus(HttpStatus.CONFLICT).bodyJson().extractingPath("$.code").isEqualTo("T212_NOT_CONNECTED");

        assertThat(put("bob", BODY)).hasStatusOk();
        assertThat(mvc.post().uri("/api/t212/sync").header(HttpHeaders.AUTHORIZATION, "Bearer bob"))
                .hasStatus(HttpStatus.ACCEPTED).bodyJson().extractingPath("$.connected").isEqualTo(true);
        assertThat(mvc.delete().uri("/api/t212/credentials").header(HttpHeaders.AUTHORIZATION, "Bearer bob"))
                .hasStatus(HttpStatus.NO_CONTENT);
    }

    @Test
    void mapsTrading212ErrorsToContractCodes() {
        ROUTES.on("/api/v0/equity/account/summary", body(401, "{}"));
        assertThat(put("alice", BODY)).hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.code")
                .isEqualTo("T212_INVALID_CREDENTIALS");

        ROUTES.on("/api/v0/equity/account/summary", json("t212/account-summary.json"))
                .on("/api/v0/equity/history/orders", body(403, "{}"));
        assertThat(put("alice", BODY)).hasStatus(HttpStatus.BAD_REQUEST).bodyJson().extractingPath("$.code")
                .isEqualTo("T212_MISSING_PERMISSIONS");

        assertThat(put("alice", "{\"apiKey\":\"\",\"environment\":\"DEMO\"}")).hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson().extractingPath("$.code").isEqualTo("BAD_REQUEST");
        assertThat(put("alice", "{\"apiKey\":\"k\",\"environment\":\"CFD\"}")).hasStatus(HttpStatus.BAD_REQUEST);
    }
}
