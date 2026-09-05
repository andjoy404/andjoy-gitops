package com.gitlabops;

import com.gitlabops.controller.AuthController;
import com.gitlabops.model.dto.AuthStatus;
import com.gitlabops.model.dto.ChangePasswordRequest;
import com.gitlabops.model.dto.AppUserDTO;
import com.gitlabops.service.AuthService;
import com.gitlabops.service.LoginAttemptStore;
import com.gitlabops.service.SessionStore;
import com.gitlabops.repository.AppUserRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthControllerTest {

    private AppUserRepository userRepository;
    private SessionStore sessionStore;
    private AuthService authService;
    private LoginAttemptStore loginAttemptStore;

    @BeforeEach
    void setUp() {
        userRepository = mock(AppUserRepository.class);
        sessionStore = new SessionStore();
        authService = mock(AuthService.class);
        loginAttemptStore = mock(LoginAttemptStore.class);
    }

    private HttpServletResponse mockResponse() {
        HttpServletResponse mock = mock(HttpServletResponse.class);
        doNothing().when(mock).addCookie(any(Cookie.class));
        return mock;
    }

    // ===========================================================
    // Req 10: FORCED PASSWORD CHANGE TESTS
    // ===========================================================

    @Test
    void forcedPasswordChange_noCurrentPassword_accepted() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", true);
        assertEquals(true, sessionStore.getSession(sessionToken).mustChangePassword());

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";
        user.passwordHash = "$argon2d$test";

        when(userRepository.findById(1L)).thenReturn(user);
        when(authService.hashNewPassword("securePass123")).thenReturn("$argon2d$newhash");
        doNothing().when(userRepository).updatePassword(eq(1L), anyString());

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setNewPassword("securePass123");

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(authService).hashNewPassword("securePass123");
        verify(userRepository).updatePassword(1L, "$argon2d$newhash");
        // Verify currentPassword NOT verified for forced change
        verify(authService, never()).verifyPassword(anyString(), anyString());
    }

    @Test
    void forcedPasswordChange_newSession_hasMustChangeFalse() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", true);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";
        user.passwordHash = "$argon2d$test";

        when(userRepository.findById(1L)).thenReturn(user);
        when(authService.hashNewPassword("securePass123")).thenReturn("$argon2d$newhash");
        doNothing().when(userRepository).updatePassword(eq(1L), anyString());

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setNewPassword("securePass123");

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());

        // Original session should be invalidated
        assertNull(sessionStore.getSession(sessionToken));
    }

    @Test
    void forcedPasswordChange_shortNewPassword_rejected() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", true);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setNewPassword("short");

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertTrue(body.containsKey("error"));
        assertTrue(body.get("error").contains("8 characters"));
    }

    @Test
    void forcedPasswordChange_emptyNewPassword_rejected() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", true);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setNewPassword("");

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void forcedPasswordChange_nullNewPassword_rejected() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", true);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        // Leave newPassword null

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    // ===========================================================
    // Req 11: NORMAL PASSWORD CHANGE TESTS
    // ===========================================================

    @Test
    void normalPasswordChange_withoutCurrentPassword_rejected() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", false);
        assertEquals(false, sessionStore.getSession(sessionToken).mustChangePassword());

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";
        user.passwordHash = "$argon2d$existing";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setNewPassword("anotherSecure1");

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertEquals("Current password is required", body.get("error"));
        verify(authService, never()).verifyPassword(anyString(), anyString());
    }

    @Test
    void normalPasswordChange_withCorrectCurrentPassword_accepted() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", false);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";
        user.passwordHash = "$argon2d$existing";

        when(userRepository.findById(1L)).thenReturn(user);
        when(authService.verifyPassword("correctPass1", "$argon2d$existing")).thenReturn(true);
        when(authService.hashNewPassword("newSecurePass1")).thenReturn("$argon2d$newhash2");
        doNothing().when(userRepository).updatePassword(eq(1L), anyString());

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setCurrentPassword("correctPass1");
        request.setNewPassword("newSecurePass1");

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(authService).verifyPassword("correctPass1", "$argon2d$existing");
        verify(authService).hashNewPassword("newSecurePass1");
        verify(userRepository).updatePassword(1L, "$argon2d$newhash2");
    }

    @Test
    void normalPasswordChange_withWrongCurrentPassword_rejected() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", false);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";
        user.passwordHash = "$argon2d$existing";

        when(userRepository.findById(1L)).thenReturn(user);
        when(authService.verifyPassword("wrongPass", "$argon2d$existing")).thenReturn(false);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setCurrentPassword("wrongPass");
        request.setNewPassword("newSecurePass1");

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertEquals("Current password is incorrect", body.get("error"));
        // Password should NOT be updated
        verify(userRepository, never()).updatePassword(anyLong(), anyString());
    }

    // ===========================================================
    // Req 12: UNAUTHENTICATED ACCESS
    // ===========================================================

    @Test
    void unauthenticatedPasswordChange_rejected() {
        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setCurrentPassword("somePass");
        request.setNewPassword("newSecurePass1");

        // No session cookie
        ResponseEntity<?> response = controller.changePassword(null, request, mockResponse());

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        assertNull(response.getBody());
    }

    @Test
    void invalidSessionPasswordChange_rejected() {
        when(userRepository.findById(1L)).thenReturn(new AppUserDTO());

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setNewPassword("newSecurePass1");

        // Invalid session token
        ResponseEntity<?> response = controller.changePassword("invalid-session-token", request, mockResponse());

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        assertNull(response.getBody());
    }

    // ===========================================================
    // Req 14: FRONTEND INTEGRATION - error message flow
    // ===========================================================

    @Test
    void forcedPasswordChange_errorReturnsBackendErrorMessage() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", true);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setNewPassword("weak"); // too short

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        @SuppressWarnings("unchecked")
        Map<String, String> body = (Map<String, String>) response.getBody();
        assertNotNull(body.get("error"));
        assertTrue(body.get("error").contains("8 characters"));
    }

    // ===========================================================
    // Bonus: Edge cases
    // ===========================================================

    @Test
    void passwordChange_sessionWithMustChangeTrue_and_currentPasswordProvided_accepted() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", true);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";
        user.passwordHash = "$argon2d$test";

        when(userRepository.findById(1L)).thenReturn(user);
        when(authService.hashNewPassword("brandNewPass1")).thenReturn("$argon2d$newhash3");
        doNothing().when(userRepository).updatePassword(eq(1L), anyString());

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setCurrentPassword("anything"); // doesn't matter for forced change
        request.setNewPassword("brandNewPass1");

        ResponseEntity<?> response = controller.changePassword(sessionToken, request, mockResponse());

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        // Current password verification should NOT be called for forced change
        verify(authService, never()).verifyPassword(anyString(), anyString());
    }

    @Test
    void statusEndpoint_reportsMustChangeFalse_afterForcedChange() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", false);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ResponseEntity<AuthStatus> status = controller.status(sessionToken);

        assertEquals(200, status.getStatusCodeValue());
        assertTrue(status.getBody().isAuthenticated());
        assertTrue(status.getBody().isEnabled());
        assertEquals("admin", status.getBody().getUsername());
        assertFalse(status.getBody().isMustChangePassword());
    }

    @Test
    void passwordChange_originalSessionInvalidated() {
        String sessionToken = sessionStore.createSession(1L, "admin", "admin", true);

        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.role = "admin";
        user.passwordHash = "$argon2d$test";

        when(userRepository.findById(1L)).thenReturn(user);
        when(authService.hashNewPassword("newPass1234")).thenReturn("$argon2d$hash");
        doNothing().when(userRepository).updatePassword(eq(1L), anyString());

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setNewPassword("newPass1234");

        controller.changePassword(sessionToken, request, mockResponse());

        // Original session should be invalidated
        assertNull(sessionStore.getSession(sessionToken));
    }

    @Test
    void statusEndpoint_nullSession_unauthenticated() {
        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "test";
        user.role = "editor";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ResponseEntity<AuthStatus> status = controller.status(null);

        assertEquals(200, status.getStatusCodeValue());
        assertFalse(status.getBody().isAuthenticated());
    }

    @Test
    void statusEndpoint_emptyCookie_unauthenticated() {
        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "test";
        user.role = "editor";

        when(userRepository.findById(1L)).thenReturn(user);

        AuthController controller = new AuthController(
                userRepository, sessionStore, authService,
                new com.gitlabops.config.UiProperties(), loginAttemptStore
        );

        ResponseEntity<AuthStatus> status = controller.status("");

        assertEquals(200, status.getStatusCodeValue());
        assertFalse(status.getBody().isAuthenticated());
    }
}
