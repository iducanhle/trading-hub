package com.earningstracker.security;

import java.time.Duration;
import java.util.List;

import com.earningstracker.web.error.ApiErrorWriter;
import com.earningstracker.web.error.ErrorCode;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless API security: {@code GET /api/health} and the Swagger UI are public; everything else needs a
 * Firebase ID token of an allowlisted, verified email.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, TokenVerifier tokenVerifier, EmailAllowlist allowlist,
            ApiErrorWriter errorWriter) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/health").permitAll()
                        .requestMatchers(HttpMethod.HEAD, "/api/health").permitAll() // uptime monitors
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs", "/v3/api-docs/**")
                        .permitAll()
                        .anyRequest().hasAuthority(FirebaseAuthenticationFilter.ALLOWED))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, ex) -> errorWriter.write(response,
                                ErrorCode.UNAUTHENTICATED,
                                reason(request, FirebaseAuthenticationFilter.UNAUTHENTICATED_REASON,
                                        "Missing bearer token")))
                        .accessDeniedHandler((request, response, ex) -> errorWriter.write(response,
                                ErrorCode.NOT_ALLOWED,
                                reason(request, FirebaseAuthenticationFilter.NOT_ALLOWED_REASON, "Not allowed"))))
                .addFilterBefore(new FirebaseAuthenticationFilter(tokenVerifier, allowlist),
                        AnonymousAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(SecurityProperties properties) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(properties.corsAllowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST"));
        cors.setAllowedHeaders(List.of(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE));
        cors.setMaxAge(Duration.ofHours(1));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return source;
    }

    private static String reason(HttpServletRequest request, String attribute, String fallback) {
        return request.getAttribute(attribute) instanceof String reason ? reason : fallback;
    }
}
