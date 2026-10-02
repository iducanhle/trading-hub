package com.earningstracker.t212;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;

import org.junit.jupiter.api.Test;

class T212CryptoTest {

    static final String MASTER_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    static final String OTHER_MASTER_KEY = Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef"
            .getBytes());

    private final T212Crypto crypto = T212Crypto.fromBase64(MASTER_KEY);

    @Test
    void roundTripsWithARandomIvPerValue() {
        T212Crypto.Sealed first = crypto.seal("secret-value", "uid-1");
        T212Crypto.Sealed second = crypto.seal("secret-value", "uid-1");

        assertThat(crypto.open(first, "uid-1")).isEqualTo("secret-value");
        assertThat(first.iv()).isNotEqualTo(second.iv());
        assertThat(first.ciphertext()).isNotEqualTo(second.ciphertext()).doesNotContain("secret-value");
        assertThat(Base64.getDecoder().decode(first.iv())).hasSize(12);
    }

    @Test
    void aWrongMasterKeyFailsCleanly() {
        T212Crypto.Sealed sealed = crypto.seal("secret-value", "uid-1");
        T212Crypto other = T212Crypto.fromBase64(OTHER_MASTER_KEY);

        assertThat(other.keyId()).isNotEqualTo(crypto.keyId()).hasSize(8);
        assertThatThrownBy(() -> other.open(sealed, "uid-1"))
                .isInstanceOf(T212Crypto.UnreadableException.class)
                .hasMessageNotContaining("secret-value")
                .hasNoCause();
    }

    @Test
    void aCiphertextOnlyOpensForItsUser() {
        T212Crypto.Sealed sealed = crypto.seal("secret-value", "uid-1");

        assertThatThrownBy(() -> crypto.open(sealed, "uid-2")).isInstanceOf(T212Crypto.UnreadableException.class);
    }

    @Test
    void tamperedDataFailsCleanly() {
        T212Crypto.Sealed sealed = crypto.seal("secret-value", "uid-1");
        byte[] bytes = Base64.getDecoder().decode(sealed.ciphertext());
        bytes[0] ^= 1;

        assertThatThrownBy(() -> crypto.open(new T212Crypto.Sealed(sealed.iv(),
                Base64.getEncoder().encodeToString(bytes)), "uid-1")).isInstanceOf(T212Crypto.UnreadableException.class);
        assertThatThrownBy(() -> crypto.open(new T212Crypto.Sealed("not base64!", sealed.ciphertext()), "uid-1"))
                .isInstanceOf(T212Crypto.UnreadableException.class);
    }

    @Test
    void rejectsMasterKeysThatAreNot32BytesWithoutEchoingThem() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);

        assertThatThrownBy(() -> T212Crypto.fromBase64(shortKey)).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("32 bytes").hasMessageNotContaining(shortKey);
        assertThatThrownBy(() -> T212Crypto.fromBase64("%%%not-base64%%%"))
                .hasMessage("T212_ENCRYPTION_KEY is not valid base64");
    }
}
