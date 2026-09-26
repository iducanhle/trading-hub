package com.earningstracker.firebase;

import com.earningstracker.security.InvalidTokenException;
import com.earningstracker.security.TokenVerifier;
import com.google.firebase.auth.FirebaseAuth;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class FirebaseConfig {

    @Bean
    TokenVerifier tokenVerifier(FirebaseAppHolder firebase) {
        return firebase.app()
                .<TokenVerifier>map(app -> new FirebaseTokenVerifier(FirebaseAuth.getInstance(app)))
                .orElseGet(() -> idToken -> {
                    throw new InvalidTokenException("Authentication is not configured on this server");
                });
    }
}
