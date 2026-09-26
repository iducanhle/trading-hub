package com.earningstracker.security;

/** Verifies a Firebase ID token. */
public interface TokenVerifier {

    /** @throws InvalidTokenException if the token is malformed, expired, revoked or cannot be verified */
    AuthenticatedUser verify(String idToken);
}
