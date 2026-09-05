package com.gitlabops;

import com.gitlabops.model.dto.AppUserDTO;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EnvironmentAuthTest {

    @Test
    void adminCanLoginAndGetStatus() {
        var sessionStore = new com.gitlabops.service.SessionStore();
        String adminToken = sessionStore.createSession(1L, "admin", "admin", false);

        var appUserDTO = new AppUserDTO();
        appUserDTO.id = 1L;
        appUserDTO.username = "admin";
        appUserDTO.passwordHash = "$argon2d$v=19$m=65536,t=3,p=1$test$test";
        appUserDTO.role = "admin";
        appUserDTO.enabled = true;
        appUserDTO.mustChangePassword = false;

        var appUserRepo = mock(com.gitlabops.repository.AppUserRepository.class);
        when(appUserRepo.findById(1L)).thenReturn(appUserDTO);

        var authController = new com.gitlabops.controller.AuthController(
            appUserRepo, sessionStore,
            mock(com.gitlabops.service.AuthService.class),
            new com.gitlabops.config.UiProperties(),
            mock(com.gitlabops.service.LoginAttemptStore.class)
        );

        var status = authController.status(adminToken);
        assertTrue(status.getBody().isAuthenticated());
        assertEquals("admin", status.getBody().getRole());
    }

    @Test
    void editorCanLoginButCannotAdmin() {
        var sessionStore = new com.gitlabops.service.SessionStore();
        String editorToken = sessionStore.createSession(2L, "editor", "editor", false);

        var appUserDTO = new AppUserDTO();
        appUserDTO.id = 2L;
        appUserDTO.username = "editor";
        appUserDTO.passwordHash = "$argon2d$v=19$m=65536,t=3,p=1$test$test";
        appUserDTO.role = "editor";
        appUserDTO.enabled = true;
        appUserDTO.mustChangePassword = false;

        var appUserRepo = mock(com.gitlabops.repository.AppUserRepository.class);
        when(appUserRepo.findById(2L)).thenReturn(appUserDTO);

        var authController = new com.gitlabops.controller.AuthController(
            appUserRepo, sessionStore,
            mock(com.gitlabops.service.AuthService.class),
            new com.gitlabops.config.UiProperties(),
            mock(com.gitlabops.service.LoginAttemptStore.class)
        );

        var status = authController.status(editorToken);
        assertTrue(status.getBody().isAuthenticated());
        assertEquals("editor", status.getBody().getRole());
        assertFalse("admin".equals(status.getBody().getRole()));
    }

    @Test
    void nullTokenReturnsUnauthenticated() {
        var authController = new com.gitlabops.controller.AuthController(
            mock(com.gitlabops.repository.AppUserRepository.class),
            new com.gitlabops.service.SessionStore(),
            mock(com.gitlabops.service.AuthService.class),
            new com.gitlabops.config.UiProperties(),
            mock(com.gitlabops.service.LoginAttemptStore.class)
        );

        var status = authController.status((String) null);
        assertNotNull(status);
        assertFalse(status.getBody().isAuthenticated());
    }

    @Test
    void invalidTokenReturnsUnauthenticated() {
        var sessionStore = new com.gitlabops.service.SessionStore();

        var authController = new com.gitlabops.controller.AuthController(
            mock(com.gitlabops.repository.AppUserRepository.class),
            sessionStore,
            mock(com.gitlabops.service.AuthService.class),
            new com.gitlabops.config.UiProperties(),
            mock(com.gitlabops.service.LoginAttemptStore.class)
        );

        var status = authController.status("completely-invalid-token");
        assertNotNull(status);
        assertFalse(status.getBody().isAuthenticated());
    }

    @Test
    void mustChangePasswordFlagIsPreserved() {
        var sessionStore = new com.gitlabops.service.SessionStore();
        String token = sessionStore.createSession(1L, "mustchange", "admin", true);

        var appUserDTO = new AppUserDTO();
        appUserDTO.id = 1L;
        appUserDTO.username = "mustchange";
        appUserDTO.passwordHash = "$argon2d$v=19$m=65536,t=3,p=1$test$test";
        appUserDTO.role = "admin";
        appUserDTO.enabled = true;
        appUserDTO.mustChangePassword = true;

        var appUserRepo = mock(com.gitlabops.repository.AppUserRepository.class);
        when(appUserRepo.findById(1L)).thenReturn(appUserDTO);

        var authController = new com.gitlabops.controller.AuthController(
            appUserRepo, sessionStore,
            mock(com.gitlabops.service.AuthService.class),
            new com.gitlabops.config.UiProperties(),
            mock(com.gitlabops.service.LoginAttemptStore.class)
        );

        var status = authController.status(token);
        assertTrue("mustchange".equals(status.getBody().getUsername()));
        assertTrue(status.getBody().getRole().equals("admin"));
        assertTrue(status.getBody().isMustChangePassword());
    }
}
