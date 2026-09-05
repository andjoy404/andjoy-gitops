package com.gitlabops.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AuthServiceTest {

    @Test
    void hashPasswordCreatesArgon2dPHCFormat() {
        var service = new AuthService();
        String hash = service.hashPassword("testPassword");
        
        assertNotNull(hash);
        assertTrue(hash.startsWith("$argon2d$v=19$m=65536,t=3,p=1$"));
    }

    @Test
    void hashNewPasswordCreatesArgon2dPHCFormat() {
        var service = new AuthService();
        String hash = service.hashNewPassword("newPassword");
        
        assertNotNull(hash);
        assertTrue(hash.startsWith("$argon2d$v=19$m=65536,t=3,p=1$"));
    }

    @Test
    void argon2dHashIsUniquePerCall() {
        var service = new AuthService();
        String hash1 = service.hashPassword("samePassword");
        String hash2 = service.hashPassword("samePassword");
        
        assertNotEquals(hash1, hash2);
    }

    @Test
    void verifyPasswordAcceptsJavaCreatedArgon2dHash() {
        var service = new AuthService();
        String hash = service.hashPassword("mySecurePass123");
        
        assertTrue(service.verifyPassword("mySecurePass123", hash));
    }

    @Test
    void verifyPasswordRejectsWrongPasswordAgainstJavaArgon2dHash() {
        var service = new AuthService();
        String hash = service.hashPassword("correctPassword");
        
        assertFalse(service.verifyPassword("wrongPassword", hash));
        assertFalse(service.verifyPassword("correctPasswor", hash));
        assertFalse(service.verifyPassword("", hash));
        assertFalse(service.verifyPassword(null, hash));
    }

    @Test
    void verifiesRustArgon2dHash() {
        String rustHash = "$argon2d$v=19$m=65536,t=3,p=1$h5mTYasym7s6P4Oryj7TlQ$1QwueXyXGPi54xUZXN8N/Y2U2BLyQ8c0E70rWaA0dgQ";
        
        var service = new AuthService();
        assertTrue(service.verifyPassword("mypassword", rustHash));
    }
    
    @Test
    void rejectsWrongPasswordAgainstRustHash() {
        String rustHash = "$argon2d$v=19$m=65536,t=3,p=1$h5mTYasym7s6P4Oryj7TlQ$1QwueXyXGPi54xUZXN8N/Y2U2BLyQ8c0E70rWaA0dgQ";
        
        var service = new AuthService();
        assertFalse(service.verifyPassword("wrongpassword", rustHash));
    }

    @Test
    void handleNullStoredHash() {
        var service = new AuthService();
        assertFalse(service.verifyPassword("anyPassword", null));
    }
    
    @Test
    void handleNullRawPassword() {
        var service = new AuthService();
        assertFalse(service.verifyPassword(null, "someHash"));
    }
}
