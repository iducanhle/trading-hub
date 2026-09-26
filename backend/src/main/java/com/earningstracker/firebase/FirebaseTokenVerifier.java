package com.earningstracker.firebase;

import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.security.InvalidTokenException;
import com.earningstracker.security.TokenVerifier;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;

/** Verifies ID tokens locally against Google's cached public keys (no per-request network call). */
class FirebaseTokenVerifier implements TokenVerifier {

    private final FirebaseAuth auth;

    FirebaseTokenVerifier(FirebaseAuth auth) {
        this.auth = auth;
    }

    @Override
    public AuthenticatedUser verify(String idToken) {
        try {
            FirebaseToken token = auth.verifyIdToken(idToken);
            return new AuthenticatedUser(token.getUid(), token.getEmail(), token.isEmailVerified());
        } catch (FirebaseAuthException e) {
            throw new InvalidTokenException("Invalid or expired token (" + e.getAuthErrorCode() + ")", e);
        } catch (IllegalArgumentException e) {
            throw new InvalidTokenException("Malformed token", e);
        }
    }
}
