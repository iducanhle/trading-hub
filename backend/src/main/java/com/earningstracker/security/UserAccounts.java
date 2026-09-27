package com.earningstracker.security;

import java.util.Optional;

/** Firebase Auth accounts, looked up by uid (the digest only mails allowlisted, verified users). */
public interface UserAccounts {

    /** Empty when Firebase is unavailable or the user does not exist. */
    Optional<AuthenticatedUser> find(String uid);
}
