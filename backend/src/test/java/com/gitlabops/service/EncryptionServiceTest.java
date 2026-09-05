package com.gitlabops.service;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.util.Base64;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class EncryptionServiceTest {

    private static final String TEST_KEY =
            "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

    private EncryptionService createService(String key) {
        StandardEnvironment env = new StandardEnvironment();
        env.getPropertySources().addFirst(
            new MapPropertySource("test", Map.of("security.encryption-key", key))
        );
        return new EncryptionService(env);
    }

    @Test
    void roundTripEncryptDecrypt() {
        var service = createService(TEST_KEY);
        String original = "glpat-test-token-value";
        
        byte[] encrypted = service.encrypt(original);
        assertNotNull(encrypted);
        assertTrue(encrypted.length > 12); // nonce (12) + ciphertext
        
        String decrypted = service.decrypt(encrypted);
        assertEquals(original, decrypted);
    }
    
    @Test
    void decryptHasCorrectFormat() {
        var service = createService(TEST_KEY);
        String original = "glpat-xxxxxxxxxxxxxxxxxxxx";
        
        byte[] encrypted = service.encrypt(original);
        
        // First 12 bytes = nonce
        byte[] nonce = new byte[12];
        System.arraycopy(encrypted, 0, nonce, 0, 12);
        
        // Rest = ciphertext (includes auth tag)
        byte[] ciphertext = new byte[encrypted.length - 12];
        System.arraycopy(encrypted, 12, ciphertext, 0, ciphertext.length);
        
        assertFalse(java.util.Arrays.equals(nonce, new byte[12])); // nonce is random
        assertTrue(ciphertext.length > 0);
    }
    
    @Test
    void rejectTooShortInput() {
        var service = createService(TEST_KEY);
        
        assertThrows(IllegalArgumentException.class, () -> {
            service.decrypt(new byte[5]);
        });
    }
    
    @Test
    void rejectNullInput() {
        var service = createService(TEST_KEY);
        
        assertThrows(IllegalArgumentException.class, () -> {
            service.decrypt(null);
        });
    }
    
    @Test
    void rejectInvalidHexKey() {
        assertThrows(IllegalArgumentException.class, () -> {
            createService("short");
        });
    }
    
    @Test
    void rejectWrongKeyLength() {
        assertThrows(IllegalArgumentException.class, () -> {
            createService("00");
        });
    }
    
    @Test
    void differentEncryptionsProduceDifferentCiphertext() {
        var service = createService(TEST_KEY);
        String original = "same-plaintext";
        
        byte[] enc1 = service.encrypt(original);
        byte[] enc2 = service.encrypt(original);
        
        assertNotEquals(java.util.Arrays.toString(enc1), java.util.Arrays.toString(enc2));
        // But decryption produces same result
        assertEquals(original, service.decrypt(enc1));
        assertEquals(original, service.decrypt(enc2));
    }
    
    @Test
    void decryptsRustCompatibleFixture() {
        // Test fixture matches the format produced by the old
        // Rust implementation (aes-gcm v0.10.3):
        // - 12-byte nonce prepended to ciphertext
        // - AES-256-GCM with 128-bit auth tag
        // Fixture generated with: key=0x00*32, nonce=0x00*12
        byte[] rustFixture = Base64.getDecoder().decode(
            "AAAAAAAAAAAAAAAAusIzSWAHAhprL6f+zpz2fRxNMvgEkh9nqTzxPHkwkDaonp8OlvWm"
        );
        
        // Verify structure: 12-byte nonce + ciphertext with tag
        assertEquals(51, rustFixture.length); // 12 nonce + 39 ciphertext+tag
        byte[] nonce = java.util.Arrays.copyOfRange(rustFixture, 0, 12);
        boolean allZero = true;
        for (byte b : nonce) {
            if (b != 0) { allZero = false; break; }
        }
        assertTrue(allZero);
        
        var service = createService(
            "0000000000000000000000000000000000000000000000000000000000000000"
        );
        String decrypted = service.decrypt(rustFixture);
        assertEquals("test-gitlab-token-12345", decrypted);
    }
    
    @Test
    void rejectsTamperedFixture() {
        byte[] rustFixture = Base64.getDecoder().decode(
            "AAAAAAAAAAAAAAAAusIzSWAHAhprL6f+zpz2fRxNMvgEkh9nqTzxPHkwkDaonp8OlvWm"
        );
        rustFixture[20] ^= 0xFF; // flip a byte in ciphertext
        
        var service = createService(
            "0000000000000000000000000000000000000000000000000000000000000000"
        );
        
        assertThrows(RuntimeException.class, () -> service.decrypt(rustFixture));
    }
}
