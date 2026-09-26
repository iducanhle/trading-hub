package com.earningstracker.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class EmailAllowlistTest {

    @Test
    void matchesCaseInsensitivelyAndIgnoresBlankEntries() {
        EmailAllowlist allowlist = new EmailAllowlist(
                new SecurityProperties(List.of(" Me@Example.com ", "", "friend@example.com"), List.of()));

        assertThat(allowlist.isAllowed("me@example.com")).isTrue();
        assertThat(allowlist.isAllowed("FRIEND@EXAMPLE.COM ")).isTrue();
        assertThat(allowlist.isAllowed("other@example.com")).isFalse();
        assertThat(allowlist.isAllowed(null)).isFalse();
    }

    @Test
    void emptyAllowlistAllowsNobody() {
        EmailAllowlist allowlist = new EmailAllowlist(new SecurityProperties(null, null));

        assertThat(allowlist.isAllowed("me@example.com")).isFalse();
    }
}
