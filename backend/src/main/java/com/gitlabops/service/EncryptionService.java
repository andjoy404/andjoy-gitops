package com.gitlabops.service;

import javax.crypto.AEADBadTagException;

import java.security.SecureRandom;

import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import io.micrometer.core.annotation.Timed;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
@Timed(description = "AES-256-GCM encryption/decryption for GitLab environment tokens")
public class EncryptionService {

    private static final Logger log = LoggerFactory.getLogger(EncryptionService.class);

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int TAG_LENGTH_BITS = 128;
    private static final int NONCE_LENGTH_BYTES = 12;
    private static final String DEFAULT_LEGACY_KEY_HEX = "0000000000000000000000000000000000000000000000000000000000000000";

    private final SecretKeySpec secretKey;
    private final SecretKeySpec fallbackLegacyKey;

    public EncryptionService(org.springframework.core.env.Environment env) {
        String encryptionKeyHex = env.getProperty("security.encryption-key", DEFAULT_LEGACY_KEY_HEX);
        byte[] keyBytes = hexToBytes(encryptionKeyHex);
        if (keyBytes.length != 32) {
            throw new IllegalArgumentException("encryption-key must be 64 hex characters (256 bits)");
        }
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
        if (!DEFAULT_LEGACY_KEY_HEX.equalsIgnoreCase(encryptionKeyHex)) {
            this.fallbackLegacyKey = new SecretKeySpec(hexToBytes(DEFAULT_LEGACY_KEY_HEX), "AES");
        } else {
            this.fallbackLegacyKey = null;
        }
    }

    private static byte[] hexToBytes(String hex) {
        if (hex.length() % 2 != 0) {
            throw new IllegalArgumentException("Hex string must contain even number of characters");
        }
        byte[] bytes = new byte[hex.length() / 2];
        for (int i = 0; i < hex.length(); i += 2) {
            int hi = Character.digit(hex.charAt(i), 16);
            int lo = Character.digit(hex.charAt(i + 1), 16);
            if (hi < 0 || lo < 0) {
                throw new IllegalArgumentException("Invalid hex character in key");
            }
            bytes[i / 2] = (byte) ((hi << 4) + lo);
        }
        return bytes;
    }

    public record DecryptionResult(String plaintext, boolean usedLegacyFallback) {}

    public DecryptionResult decryptInternal(byte[] encryptedValue) {
        if (encryptedValue == null || encryptedValue.length < NONCE_LENGTH_BYTES + 1) {
            throw new IllegalArgumentException("Invalid encrypted token: too short");
        }
        try {
            return new DecryptionResult(decryptWithKey(encryptedValue, secretKey), false);
        } catch (AEADBadTagException e) {
            if (fallbackLegacyKey != null) {
                try {
                    String decrypted = decryptWithKey(encryptedValue, fallbackLegacyKey);
                    log.info("Successfully decrypted environment token using legacy default key fallback");
                    return new DecryptionResult(decrypted, true);
                } catch (Exception ignored) {
                }
            }
            throw new RuntimeException("Unable to decrypt environment token: authentication tag mismatch. " +
                "The token was encrypted with a different ENVIRONMENT_TOKEN_ENCRYPTION_KEY. " +
                "Please update the GitLab token in the Environments menu.", e);
        } catch (Exception e) {
            throw new RuntimeException("Unable to decrypt environment token", e);
        }
    }

    public String decrypt(byte[] encryptedValue) {
        return decryptInternal(encryptedValue).plaintext();
    }

    private String decryptWithKey(byte[] encryptedValue, SecretKeySpec key) throws Exception {
        byte[] nonce = java.util.Arrays.copyOfRange(encryptedValue, 0, NONCE_LENGTH_BYTES);
        byte[] ciphertext = java.util.Arrays.copyOfRange(encryptedValue, NONCE_LENGTH_BYTES, encryptedValue.length);

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        GCMParameterSpec spec = new GCMParameterSpec(TAG_LENGTH_BITS, nonce);
        cipher.init(Cipher.DECRYPT_MODE, key, spec);
        byte[] decrypted = cipher.doFinal(ciphertext);
        return new String(decrypted, java.nio.charset.StandardCharsets.UTF_8);
    }

    public byte[] encrypt(String plaintext) {
        try {
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            byte[] nonce = new byte[NONCE_LENGTH_BYTES];
            SecureRandom.getInstanceStrong().nextBytes(nonce);

            GCMParameterSpec spec = new GCMParameterSpec(TAG_LENGTH_BITS, nonce);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec);
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            byte[] encrypted = new byte[NONCE_LENGTH_BYTES + ciphertext.length];
            System.arraycopy(nonce, 0, encrypted, 0, NONCE_LENGTH_BYTES);
            System.arraycopy(ciphertext, 0, encrypted, NONCE_LENGTH_BYTES, ciphertext.length);
            return encrypted;
        } catch (Exception e) {
            throw new RuntimeException("Unable to encrypt environment token", e);
        }
    }

    public String encryptBase64(String plaintext) {
        return Base64.getEncoder().encodeToString(encrypt(plaintext));
    }
}
