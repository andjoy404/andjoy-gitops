package com.gitlabops.service;

import javax.crypto.AEADBadTagException;

import java.security.SecureRandom;

import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import io.micrometer.core.annotation.Timed;

import org.springframework.stereotype.Service;

@Service
@Timed(description = "AES-256-GCM encryption/decryption for GitLab environment tokens")
public class EncryptionService {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int TAG_LENGTH_BITS = 128;
    private static final int NONCE_LENGTH_BYTES = 12;

    private final SecretKeySpec secretKey;

    public EncryptionService(org.springframework.core.env.Environment env) {
        String encryptionKeyHex = env.getProperty("security.encryption-key", "0000000000000000000000000000000000000000000000000000000000000000");
        byte[] keyBytes = hexToBytes(encryptionKeyHex);
        if (keyBytes.length != 32) {
            throw new IllegalArgumentException("encryption-key must be 64 hex characters (256 bits)");
        }
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
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

    public String decrypt(byte[] encryptedValue) {
        if (encryptedValue == null || encryptedValue.length < NONCE_LENGTH_BYTES + 1) {
            throw new IllegalArgumentException("Invalid encrypted token: too short");
        }
        try {
            byte[] nonce = java.util.Arrays.copyOfRange(encryptedValue, 0, NONCE_LENGTH_BYTES);
            byte[] ciphertext = java.util.Arrays.copyOfRange(encryptedValue, NONCE_LENGTH_BYTES, encryptedValue.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec spec = new GCMParameterSpec(TAG_LENGTH_BITS, nonce);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);
            byte[] decrypted = cipher.doFinal(ciphertext);
            return new String(decrypted, java.nio.charset.StandardCharsets.UTF_8);
        } catch (AEADBadTagException e) {
            throw new RuntimeException("Unable to decrypt environment token: authentication tag mismatch", e);
        } catch (Exception e) {
            throw new RuntimeException("Unable to decrypt environment token", e);
        }
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
