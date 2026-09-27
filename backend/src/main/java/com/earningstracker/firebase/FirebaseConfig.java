package com.earningstracker.firebase;

import java.util.Optional;

import com.earningstracker.security.AuthenticatedUser;
import com.earningstracker.security.InvalidTokenException;
import com.earningstracker.security.TokenVerifier;
import com.earningstracker.security.UserAccounts;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class FirebaseConfig {

    private static final Logger log = LoggerFactory.getLogger(FirebaseConfig.class);

    @Bean
    UserAccounts userAccounts(FirebaseAppHolder firebase) {
        return uid -> firebase.app().flatMap(app -> {
            try {
                UserRecord user = FirebaseAuth.getInstance(app).getUser(uid);
                return Optional.of(new AuthenticatedUser(uid, user.getEmail(), user.isEmailVerified()));
            } catch (FirebaseAuthException e) {
                log.info("No Firebase account for uid {}: {}", uid, e.getAuthErrorCode());
                return Optional.empty();
            }
        });
    }

    @Bean
    TokenVerifier tokenVerifier(FirebaseAppHolder firebase) {
        return firebase.app()
                .<TokenVerifier>map(app -> new FirebaseTokenVerifier(FirebaseAuth.getInstance(app)))
                .orElseGet(() -> idToken -> {
                    throw new InvalidTokenException("Authentication is not configured on this server");
                });
    }
}
