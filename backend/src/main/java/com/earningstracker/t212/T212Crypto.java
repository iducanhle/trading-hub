package com.earningstracker.t212;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * AES-256-GCM for stored Trading 212 keys: a random 12-byte IV per value, a 128-bit tag, and the user's uid as
 * additional authenticated data, so a ciphertext copied into another user's document does not decrypt.
 */
public final class T212Crypto {

    /** An encrypted value as stored in Firestore (both base64). */
    public record Sealed(String iv, String ciphertext) {
    }

    /** Decryption failed: wrong master key, wrong user, or tampered data. Carries no detail on purpose. */
    public static class UnreadableException extends RuntimeException {
        public UnreadableException() {
            super("stored value cannot be decrypted with the current T212_ENCRYPTION_KEY");
        }
    }

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final String keyId;
    private final SecureRandom random = new SecureRandom();

    private T212Crypto(byte[] keyBytes) {
        this.key = new SecretKeySpec(keyBytes, "AES");
        this.keyId = fingerprint(keyBytes);
    }

    /**
     * @param base64Key {@code T212_ENCRYPTION_KEY}
     * @throws IllegalArgumentException if it is not base64 of exactly 32 bytes (the message never echoes it)
     */
    public static T212Crypto fromBase64(String base64Key) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64Key.strip());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("T212_ENCRYPTION_KEY is not valid base64");
        }
        if (bytes.length != 32) {
            throw new IllegalArgumentException("T212_ENCRYPTION_KEY must be 32 bytes (base64 of 32 random bytes), got "
                    + bytes.length);
        }
        return new T212Crypto(bytes);
    }

    /** First 8 hex characters of SHA-256 of the master key: tells whether a stored value used this key. */
    public String keyId() {
        return keyId;
    }

    public Sealed seal(String plaintext, String uid) {
        byte[] iv = new byte[IV_BYTES];
        random.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(uid.getBytes(StandardCharsets.UTF_8));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return new Sealed(Base64.getEncoder().encodeToString(iv), Base64.getEncoder().encodeToString(ciphertext));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("AES-GCM is not available", e);
        }
    }

    public String open(Sealed sealed, String uid) {
        try {
            byte[] iv = Base64.getDecoder().decode(sealed.iv());
            byte[] ciphertext = Base64.getDecoder().decode(sealed.ciphertext());
            if (iv.length != IV_BYTES) {
                throw new UnreadableException();
            }
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(uid.getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new UnreadableException();
        }
    }

    private static String fingerprint(byte[] keyBytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(keyBytes), 0, 4);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
