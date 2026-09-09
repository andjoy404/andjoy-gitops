package com.gitlabops.controller;

import com.gitlabops.config.SecurityConfig;
import com.gitlabops.config.UiProperties;
import com.gitlabops.model.dto.AppUserDTO;
import com.gitlabops.model.dto.AuthStatus;
import com.gitlabops.model.dto.ChangePasswordRequest;
import com.gitlabops.model.dto.LoginRequest;
import com.gitlabops.repository.AppUserRepository;
import com.gitlabops.service.AuthService;
import com.gitlabops.service.LoginAttemptStore;
import com.gitlabops.service.SessionStore;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AppUserRepository userRepository;
    private final SessionStore sessionStore;
    private final AuthService authService;
    private final UiProperties uiProperties;
    private final LoginAttemptStore loginAttemptStore;

    public AuthController(AppUserRepository userRepository,
                          SessionStore sessionStore,
                          AuthService authService,
                          UiProperties uiProperties,
                          LoginAttemptStore loginAttemptStore) {
        this.userRepository = userRepository;
        this.sessionStore = sessionStore;
        this.authService = authService;
        this.uiProperties = uiProperties;
        this.loginAttemptStore = loginAttemptStore;
    }

    @GetMapping("/status")
    public ResponseEntity<AuthStatus> status(
            @CookieValue(value = "gcd_session", required = false) String sessionCookie) {

        AuthStatus status = new AuthStatus();

        if (sessionCookie != null && !sessionCookie.isEmpty()) {
            SessionStore.SessionInfo session = sessionStore.getSession(sessionCookie);
            if (session != null) {
                status.setAuthenticated(true);
                status.setEnabled(true);
                status.setUsername(session.username());
                status.setRole(session.role());
                status.setMustChangePassword(session.mustChangePassword());
                return ResponseEntity.ok(status);
            }
        }

        status.setAuthenticated(false);
        status.setEnabled(true);
        return ResponseEntity.ok(status);
    }

    public ResponseEntity<?> login(LoginRequest request, HttpServletResponse response) {
        return login(request, null, response);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request,
                                   HttpServletRequest httpRequest,
                                   HttpServletResponse response) {
        String username = request.getUsername().trim();

        if (loginAttemptStore.isThrottled(username)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("error", "Too many login attempts. Try again later."));
        }

        if (username.isEmpty() || request.getPassword() == null) {
            loginAttemptStore.recordAttempt(username, false);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthError("Invalid username or password"));
        }

        AppUserDTO user = userRepository.findByUsername(username);
        if (user == null) {
            loginAttemptStore.recordAttempt(username, false);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthError("Invalid username or password"));
        }

        if (!authService.verifyPassword(request.getPassword(), user.passwordHash)) {
            loginAttemptStore.recordAttempt(username, false);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthError("Invalid username or password"));
        }

        loginAttemptStore.recordAttempt(username, true);

        String sessionId = sessionStore.createSession(
                user.id, user.username, user.role, Boolean.TRUE.equals(user.mustChangePassword));

        Cookie cookie = new Cookie("gcd_session", sessionId);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        boolean isSecure = SecurityConfig.isSecure(httpRequest);
        cookie.setSecure(isSecure);
        cookie.setMaxAge(getSessionCookieMaxAge());
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);

        AuthStatus status = new AuthStatus();
        status.setAuthenticated(true);
        status.setEnabled(true);
        status.setUsername(user.username);
        status.setRole(user.role);
        status.setMustChangePassword(Boolean.TRUE.equals(user.mustChangePassword));
        return ResponseEntity.ok(status);
    }

    @PostMapping("/logout")
    public void logout(
            @CookieValue(value = "gcd_session", required = false) String sessionCookie,
            HttpServletRequest request,
            HttpServletResponse response) {
        if (sessionCookie != null && !sessionCookie.isEmpty()) {
            sessionStore.invalidate(sessionCookie);
        }

        Cookie cookie = new Cookie("gcd_session", null);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        cookie.setSecure(SecurityConfig.isSecure(request));
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }

    public ResponseEntity<?> changePassword(
            String sessionCookie,
            ChangePasswordRequest request,
            HttpServletResponse response) {
        return changePassword(sessionCookie, request, null, response);
    }

    @PutMapping("/password")
    public ResponseEntity<?> changePassword(
            @CookieValue(value = "gcd_session", required = false) String sessionCookie,
            @RequestBody ChangePasswordRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {

        if (sessionCookie == null || sessionCookie.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        SessionStore.SessionInfo session = sessionStore.getSession(sessionCookie);
        if (session == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String currentPass = request.getCurrentPassword();
        String newPass = request.getNewPassword();

        if (newPass == null || newPass.length() < 8) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "New password must be at least 8 characters"));
        }

        if (!session.mustChangePassword()) {
            if (currentPass == null || currentPass.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Current password is required"));
            }

            AppUserDTO user = userRepository.findById(session.userId());
            if (user == null || !authService.verifyPassword(currentPass, user.passwordHash)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Current password is incorrect"));
            }
        }

        String hash = authService.hashNewPassword(newPass);
        userRepository.updatePassword(session.userId(), hash);

        sessionStore.invalidate(sessionCookie);

        String newSessionId = sessionStore.createSession(
                session.userId(), session.username(), session.role(), false);

        Cookie cookie = new Cookie("gcd_session", newSessionId);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        cookie.setSecure(SecurityConfig.isSecure(httpRequest));
        cookie.setMaxAge(getSessionCookieMaxAge());
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);

        return ResponseEntity.noContent().build();
    }

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile(
            @CookieValue(value = "gcd_session", required = false) String sessionCookie) {
        if (sessionCookie == null || sessionCookie.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        SessionStore.SessionInfo session = sessionStore.getSession(sessionCookie);
        if (session == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        AppUserDTO user = userRepository.findById(session.userId());
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("id", user.id);
        result.put("username", user.username);
        result.put("display_name", user.displayName != null ? user.displayName : "");
        result.put("email", user.email != null ? user.email : "");
        result.put("role", user.role);
        return ResponseEntity.ok(result);
    }

    public ResponseEntity<?> updateProfile(
            String sessionCookie,
            Map<String, Object> body,
            HttpServletResponse response) {
        return updateProfile(sessionCookie, body, null, response);
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(
            @CookieValue(value = "gcd_session", required = false) String sessionCookie,
            @RequestBody Map<String, Object> body,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        if (sessionCookie == null || sessionCookie.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        SessionStore.SessionInfo session = sessionStore.getSession(sessionCookie);
        if (session == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        AppUserDTO user = userRepository.findById(session.userId());
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        String displayName = body.get("display_name") != null ? body.get("display_name").toString().trim() : "";
        String email = body.get("email") != null ? body.get("email").toString().trim() : "";
        String currentPassword = body.get("current_password") != null ? body.get("current_password").toString() : null;
        String newPassword = body.get("new_password") != null ? body.get("new_password").toString() : null;

        if (newPassword != null && !newPassword.trim().isEmpty()) {
            if (newPassword.length() < 8) {
                return ResponseEntity.badRequest().body(Map.of("error", "New password must be at least 8 characters"));
            }
            if (currentPassword == null || currentPassword.isEmpty() || !authService.verifyPassword(currentPassword, user.passwordHash)) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "Current password is incorrect"));
            }
            String hash = authService.hashNewPassword(newPassword);
            userRepository.updatePassword(user.id, hash);
        }

        userRepository.updateProfile(user.id, displayName, email);
        return ResponseEntity.ok(Map.of("message", "Profile updated successfully"));
    }

    public static int getSessionCookieMaxAge() {
        if (SessionStore.ABSOLUTE_TIMEOUT_MS == Long.MAX_VALUE) {
            return 365 * 24 * 3600; // 1 year when timeout disabled
        }
        long seconds = SessionStore.ABSOLUTE_TIMEOUT_MS / 1000L;
        return (int) Math.min(seconds, Integer.MAX_VALUE);
    }

    private record AuthError(String error) {}
}
