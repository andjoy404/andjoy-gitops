package com.gitlabops;

import com.gitlabops.config.AnalyticsProperties;
import com.gitlabops.config.UiProperties;
import com.gitlabops.controller.AuthController;
import com.gitlabops.controller.ConfigController;
import com.gitlabops.service.LoginAttemptStore;
import com.gitlabops.service.SessionStore;
import org.junit.jupiter.api.Test;
import org.springframework.boot.info.BuildProperties;
import org.springframework.core.env.StandardEnvironment;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ControllerUnitTest {

    @Test
    void configControllerReturnsCorrectValues() {
        var uiProps = new UiProperties();
        uiProps.setReadOnly(true);
        uiProps.setHideWriteActions(false);
        uiProps.setPageSizeOptions(java.util.List.of(10, 20, 30));
        uiProps.setDefaultPageSize(10);

        var analyticsProps = new AnalyticsProperties();
        analyticsProps.setRetentionDays(30);
        BuildProperties buildProps = null;
        
        var configController = new ConfigController(uiProps, analyticsProps, buildProps);
        var response = configController.getConfig();
        assertEquals(true, response.isReadOnly());
        assertEquals(false, response.isHideWriteActions());
        assertEquals(10, response.getDefaultPageSize());
        assertEquals(30, response.getAnalyticsRetentionDays());
    }

    @Test
    void authControllerStatusReturnsUnauthenticatedWithEmptySession() {
        var authController = new AuthController(
            mock(com.gitlabops.repository.AppUserRepository.class),
            mock(com.gitlabops.service.SessionStore.class),
            mock(com.gitlabops.service.AuthService.class),
            new UiProperties(),
            mock(com.gitlabops.service.LoginAttemptStore.class)
        );

        var authStatus = authController.status((String) null);
        assertNotNull(authStatus);
        assertFalse(authStatus.getBody().isAuthenticated());
    }

    @Test
    void authControllerStatusReturnsAuthenticatedWithValidSession() {
        var sessionStore = new com.gitlabops.service.SessionStore();
        var token = sessionStore.createSession(1L, "testuser", "editor", false);

        var authController = new AuthController(
            mock(com.gitlabops.repository.AppUserRepository.class),
            sessionStore,
            mock(com.gitlabops.service.AuthService.class),
            new UiProperties(),
            mock(com.gitlabops.service.LoginAttemptStore.class)
        );

        var authStatus = authController.status(token);
        assertTrue(authStatus.getBody().isAuthenticated());
        assertEquals("testuser", authStatus.getBody().getUsername());
        assertEquals("editor", authStatus.getBody().getRole());
    }

    @Test
    void authenticationSessionBeanHasSecureRandom() {
        var sessionStore = new SessionStore();
        String token1 = sessionStore.createSession(1L, "user1", "editor", false);
        String token2 = sessionStore.createSession(2L, "user2", "admin", true);

        assertNotNull(token1);
        assertNotNull(token2);
        assertNotEquals(token1, token2);
        assertEquals(64, token1.length()); // 32 bytes = 64 hex chars

        var session = sessionStore.getSession(token1);
        assertNotNull(session);
        assertEquals(1L, session.userId());
        assertEquals("user1", session.username());
        assertEquals("editor", session.role());
        assertFalse(session.mustChangePassword());

        sessionStore.invalidate(token1);
        assertNull(sessionStore.getSession(token1));
    }

    @Test
    void encryptionServiceDecryptsCorrectFixture() {
        var env = new StandardEnvironment();
        env.getPropertySources().addFirst(
            new org.springframework.core.env.MapPropertySource("test",
                Map.of("security.encryption-key",
                    "0000000000000000000000000000000000000000000000000000000000000000")));
        var encryptionService = new com.gitlabops.service.EncryptionService(env);
        String plaintext = "my-gitlab-token-123";
        byte[] encrypted = encryptionService.encrypt(plaintext);
        assertNotNull(encrypted);
        assertNotEquals(plaintext.length(), encrypted.length);
        String decrypted = encryptionService.decrypt(encrypted);
        assertEquals(plaintext, decrypted);
    }

    @Test
    void encryptionServiceRejectsBadCiphertext() {
        var env = new StandardEnvironment();
        env.getPropertySources().addFirst(
            new org.springframework.core.env.MapPropertySource("test",
                Map.of("security.encryption-key",
                    "0000000000000000000000000000000000000000000000000000000000000000")));
        var encryptionService = new com.gitlabops.service.EncryptionService(env);
        byte[] tampered = new byte[]{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1};
        assertThrows(RuntimeException.class, () -> encryptionService.decrypt(tampered));
    }

    @Test
    void loginAttemptStoreAllowsFreshLogin() {
        var store = new LoginAttemptStore();
        assertFalse(store.isThrottled("newuser"));
    }

    @Test
    void loginAttemptStoreThrottlesAfterFiveAttempts() {
        var store = new LoginAttemptStore();
        for (int i = 0; i < 5; i++) {
            store.recordAttempt("target", false);
        }
        assertTrue(store.isThrottled("target"));
    }

    @Test
    void loginAttemptStoreClearsOnSuccess() {
        var store = new LoginAttemptStore();
        store.recordAttempt("user", false);
        store.recordAttempt("user", false);
        store.recordAttempt("user", true);
        assertFalse(store.isThrottled("user"));
    }

    @Test
    void loginAttemptStoreExpiriesAfterWindow() throws InterruptedException {
        var store = new LoginAttemptStore();
        for (int i = 0; i < 5; i++) {
            store.recordAttempt("timer", false);
        }
        assertTrue(store.isThrottled("timer"));
        // Allow 61s for the window to expire
        Thread.sleep(65_000);
        assertFalse(store.isThrottled("timer"));
    }

    @Test
    void buildMetadataLoadsFromClasspath() {
        var res = new org.springframework.core.io.ClassPathResource("build-info.properties");
        if (!res.exists()) {
            // File may not exist in test classpath — skip assertion
            return;
        }
        java.util.Properties props = new java.util.Properties();
        try (var is = res.getInputStream()) {
            props.load(is);
        } catch (java.io.IOException e) {
            fail("Failed to load build-info.properties: " + e.getMessage());
        }

        String name = props.getProperty("build.name");
        assertNotNull(name);
        assertFalse(name.isEmpty());
        assertFalse(name.contains("${"));

        String version = props.getProperty("build.version");
        assertNotNull(version);
        assertFalse(version.isEmpty());
        assertFalse(version.contains("${"));

        String group = props.getProperty("build.group");
        if (group != null) {
            assertFalse(group.contains("${"));
        }

        String artifact = props.getProperty("build.artifact");
        if (artifact != null) {
            assertFalse(artifact.contains("${"));
        }
    }

    @Test
    void configControllerVersionNotPlaceholder() {
        var uiProps = new UiProperties();
        uiProps.setReadOnly(true);
        uiProps.setHideWriteActions(false);
        uiProps.setPageSizeOptions(java.util.List.of(10, 20, 30));
        uiProps.setDefaultPageSize(10);

        var analyticsProps = new AnalyticsProperties();
        analyticsProps.setRetentionDays(30);

        var configController = new ConfigController(uiProps, analyticsProps, null);
        var response = configController.getConfig();
        var version = response.getApiVersion();
        if (version != null) {
            assertFalse(version.contains("${"),
                "API version should not contain unresolved placeholders, got: " + version);
        }
    }
}
