package com.earningstracker.t212;

import java.util.Optional;

import com.earningstracker.web.error.ApiException;
import com.earningstracker.web.error.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * The master key from {@code T212_ENCRYPTION_KEY}. Missing or invalid, the Trading 212 feature is off (503
 * {@code T212_NOT_CONFIGURED}) and the rest of the app runs normally.
 */
@Component
public class T212Encryption {

    private static final Logger log = LoggerFactory.getLogger(T212Encryption.class);

    private final T212Crypto crypto;
    private final String problem;

    public T212Encryption(T212Properties properties) {
        String key = properties.encryptionKey();
        T212Crypto created = null;
        String reason = null;
        if (key == null || key.isBlank()) {
            reason = "T212_ENCRYPTION_KEY is not set";
            log.info("Trading 212 is off: {}", reason);
        } else {
            try {
                created = T212Crypto.fromBase64(key);
            } catch (IllegalArgumentException e) {
                reason = e.getMessage();
                log.error("Trading 212 is off: {}. Generate one with: openssl rand -base64 32", reason);
            }
        }
        this.crypto = created;
        this.problem = reason;
    }

    public Optional<T212Crypto> crypto() {
        return Optional.ofNullable(crypto);
    }

    /** The crypto, or 503 {@code T212_NOT_CONFIGURED}. */
    public T212Crypto require() {
        if (crypto == null) {
            throw new ApiException(ErrorCode.T212_NOT_CONFIGURED,
                    "Trading 212 is not available on this server (" + problem + ")");
        }
        return crypto;
    }
}
