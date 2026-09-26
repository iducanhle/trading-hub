package com.earningstracker.security;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.preauth.PreAuthenticatedAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates {@code Authorization: Bearer <Firebase ID token>}. Allowed users get the {@link #ALLOWED}
 * authority. Verified users who are not allowed are authenticated without it, so they get 403 instead of 401.
 * Requests without a valid token continue anonymously and are rejected later if the endpoint is protected.
 * Tokens are never logged.
 */
public class FirebaseAuthenticationFilter extends OncePerRequestFilter {

    public static final String ALLOWED = "ALLOWED";
    static final String UNAUTHENTICATED_REASON = FirebaseAuthenticationFilter.class.getName() + ".unauthenticated";
    static final String NOT_ALLOWED_REASON = FirebaseAuthenticationFilter.class.getName() + ".notAllowed";

    private static final Logger log = LoggerFactory.getLogger(FirebaseAuthenticationFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    private final TokenVerifier tokenVerifier;
    private final EmailAllowlist allowlist;
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    public FirebaseAuthenticationFilter(TokenVerifier tokenVerifier, EmailAllowlist allowlist) {
        this.tokenVerifier = tokenVerifier;
        this.allowlist = allowlist;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            authenticate(request, header.substring(BEARER_PREFIX.length()).strip());
        }
        chain.doFilter(request, response);
    }

    private void authenticate(HttpServletRequest request, String idToken) {
        AuthenticatedUser user;
        try {
            user = tokenVerifier.verify(idToken);
        } catch (InvalidTokenException e) {
            log.debug("Rejected bearer token: {}", e.getMessage());
            request.setAttribute(UNAUTHENTICATED_REASON, e.getMessage());
            return;
        }

        List<GrantedAuthority> authorities = List.of();
        if (!allowlist.isAllowed(user.email())) {
            deny(request, user, "Email address is not on the allowlist");
        } else if (!user.emailVerified()) {
            deny(request, user, "Email address is not verified");
        } else {
            authorities = List.of(new SimpleGrantedAuthority(ALLOWED));
        }

        SecurityContext context = contextHolder.createEmptyContext();
        context.setAuthentication(new PreAuthenticatedAuthenticationToken(user, null, authorities));
        contextHolder.setContext(context);
    }

    private static void deny(HttpServletRequest request, AuthenticatedUser user, String reason) {
        log.info("Denied uid={} email={}: {}", user.uid(), user.email(), reason);
        request.setAttribute(NOT_ALLOWED_REASON, reason);
    }
}
