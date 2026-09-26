package com.earningstracker.security;

/** The caller, as stated by a verified Firebase ID token. {@code email} can be null for some sign-in methods. */
public record AuthenticatedUser(String uid, String email, boolean emailVerified) {
}
