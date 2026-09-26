package com.earningstracker.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityIntegrationTest {

    private static final String TOKEN = "test-token";

    @Autowired
    private MockMvcTester mvc;

    @MockitoBean
    private TokenVerifier tokenVerifier;

    private void tokenBelongsTo(String email, boolean emailVerified) {
        given(tokenVerifier.verify(TOKEN)).willReturn(new AuthenticatedUser("uid-1", email, emailVerified));
    }

    private MockMvcTester.MockMvcRequestBuilder getWithToken(String uri) {
        return mvc.get().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN);
    }

    @Test
    void healthIsPublic() {
        assertThat(mvc.get().uri("/api/health"))
                .hasStatusOk()
                .bodyJson().isLenientlyEqualTo("{\"status\":\"UP\"}");
        assertThat(mvc.head().uri("/api/health")).hasStatusOk();
    }

    @Test
    void missingTokenIsUnauthenticated() {
        assertThat(mvc.get().uri("/api/me"))
                .hasStatus(HttpStatus.UNAUTHORIZED)
                .bodyJson().isLenientlyEqualTo("{\"code\":\"UNAUTHENTICATED\",\"message\":\"Missing bearer token\"}");
    }

    @Test
    void invalidTokenIsUnauthenticated() {
        given(tokenVerifier.verify("bad")).willThrow(new InvalidTokenException("Invalid or expired token"));

        assertThat(mvc.get().uri("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer bad"))
                .hasStatus(HttpStatus.UNAUTHORIZED)
                .bodyJson().isLenientlyEqualTo(
                        "{\"code\":\"UNAUTHENTICATED\",\"message\":\"Invalid or expired token\"}");
    }

    @Test
    void emailNotOnAllowlistIsForbidden() {
        tokenBelongsTo("stranger@example.com", true);

        assertThat(getWithToken("/api/me"))
                .hasStatus(HttpStatus.FORBIDDEN)
                .bodyJson().isLenientlyEqualTo(
                        "{\"code\":\"NOT_ALLOWED\",\"message\":\"Email address is not on the allowlist\"}");
    }

    @Test
    void unverifiedEmailIsForbidden() {
        tokenBelongsTo("me@example.com", false);

        assertThat(getWithToken("/api/me"))
                .hasStatus(HttpStatus.FORBIDDEN)
                .bodyJson().isLenientlyEqualTo(
                        "{\"code\":\"NOT_ALLOWED\",\"message\":\"Email address is not verified\"}");
    }

    @Test
    void allowedUserGetsMe() {
        tokenBelongsTo("friend@example.com", true); // allowlisted as Friend@Example.com

        assertThat(getWithToken("/api/me"))
                .hasStatusOk()
                .bodyJson().isStrictlyEqualTo(
                        "{\"uid\":\"uid-1\",\"email\":\"friend@example.com\",\"allowed\":true}");
    }

    @Test
    void unknownEndpointUsesContractErrorFormat() {
        tokenBelongsTo("me@example.com", true);

        assertThat(getWithToken("/api/does-not-exist"))
                .hasStatus(HttpStatus.NOT_FOUND)
                .bodyJson().extractingPath("$.code").isEqualTo("NOT_FOUND");
    }

    @Test
    void actuatorHealthIsNotPublic() {
        assertThat(mvc.get().uri("/actuator/health")).hasStatus(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void apiDocsArePublic() {
        assertThat(mvc.get().uri("/v3/api-docs")).hasStatusOk();
    }

    @Test
    void corsPreflightAllowsConfiguredOrigin() {
        assertThat(mvc.options().uri("/api/me")
                .header(HttpHeaders.ORIGIN, "http://localhost:4200")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization"))
                .hasStatusOk()
                .headers().hasValue(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:4200");
    }

    @Test
    void corsPreflightRejectsOtherOrigins() {
        assertThat(mvc.options().uri("/api/me")
                .header(HttpHeaders.ORIGIN, "https://evil.example.com")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .hasStatus(HttpStatus.FORBIDDEN);
    }
}
