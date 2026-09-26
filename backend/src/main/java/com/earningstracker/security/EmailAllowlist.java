package com.earningstracker.security;

import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Emails from {@code ALLOWED_EMAILS}, compared case-insensitively. */
@Component
public class EmailAllowlist {

    private static final Logger log = LoggerFactory.getLogger(EmailAllowlist.class);

    private final Set<String> emails;

    public EmailAllowlist(SecurityProperties properties) {
        this.emails = properties.allowedEmails().stream()
                .map(EmailAllowlist::normalize)
                .collect(Collectors.toUnmodifiableSet());
        if (emails.isEmpty()) {
            log.warn("ALLOWED_EMAILS is empty, so nobody can use the API");
        } else {
            log.info("Email allowlist has {} entries", emails.size());
        }
    }

    public boolean isAllowed(String email) {
        return email != null && emails.contains(normalize(email));
    }

    private static String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }
}
