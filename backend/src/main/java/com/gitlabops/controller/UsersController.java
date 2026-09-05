package com.gitlabops.controller;

import com.gitlabops.model.dto.AppUserDTO;
import com.gitlabops.repository.AppUserRepository;
import com.gitlabops.repository.PreferencesRepository;
import com.gitlabops.service.AuthService;
import com.gitlabops.service.SessionStore;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
public class UsersController {

    private static final Logger log = LoggerFactory.getLogger(UsersController.class);

    private final AppUserRepository userRepository;
    private final PreferencesRepository preferencesRepository;
    private final SessionStore sessionStore;
    private final AuthService authService;

    public UsersController(AppUserRepository userRepository,
                          PreferencesRepository preferencesRepository,
                          SessionStore sessionStore,
                          AuthService authService) {
        this.userRepository = userRepository;
        this.preferencesRepository = preferencesRepository;
        this.sessionStore = sessionStore;
        this.authService = authService;
    }

    private Long getCurrentUserId(HttpServletRequest request) {
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("gcd_session".equals(cookie.getName())) {
                    String token = cookie.getValue();
                    SessionStore.SessionInfo session = sessionStore.getSession(token);
                    if (session != null) {
                        return session.userId();
                    }
                }
            }
        }
        return null;
    }

    private boolean isAdmin(HttpServletRequest request) {
        Long userId = getCurrentUserId(request);
        if (userId == null) return false;
        AppUserDTO user = userRepository.findById(userId);
        return user != null && "admin".equals(user.role);
    }

    @GetMapping("/users")
    public ResponseEntity<?> listUsers(HttpServletRequest request) {
        if (!isAdmin(request)) {
            return ResponseEntity.status(403).body(Map.of("message", "Admin access required"));
        }
        List<AppUserDTO> users = userRepository.listAll();
        List<Map<String, Object>> result = new ArrayList<>();
        for (AppUserDTO u : users) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.id);
            m.put("username", u.username);
            m.put("display_name", u.displayName != null ? u.displayName : "");
            m.put("email", u.email != null ? u.email : "");
            m.put("role", u.role);
            m.put("enabled", u.enabled != null && u.enabled);
            if (u.created_at != null) {
                m.put("created_at", u.created_at.toString());
            }
            result.add(m);
        }
        return ResponseEntity.ok(result);
    }

    @PostMapping("/users")
    public ResponseEntity<?> createUser(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        if (!isAdmin(request)) {
            return ResponseEntity.status(403).body(Map.of("message", "Admin access required"));
        }

        String username = (String) body.getOrDefault("username", "").toString().trim();
        String password = (String) body.getOrDefault("password", "").toString();
        String displayName = (String) body.getOrDefault("display_name", "").toString();
        String email = (String) body.getOrDefault("email", "").toString();
        String role = (String) body.getOrDefault("role", "editor").toString();
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));

        if (username.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Username is required"));
        }
        if (password.isEmpty() || password.length() < 8) {
            return ResponseEntity.badRequest().body(Map.of("message", "Password must be at least 8 characters"));
        }
        if (!"admin".equals(role) && !"editor".equals(role)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid role"));
        }

        AppUserDTO existing = userRepository.findByUsername(username);
        if (existing != null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Username already exists"));
        }

        String hashedPassword = authService.hashNewPassword(password);

        Long id = userRepository.create(username, hashedPassword, displayName, email, role, enabled);
        if (id == null) {
            return ResponseEntity.status(500).body(Map.of("message", "Failed to create user"));
        }

        return ResponseEntity.status(201).body(Map.of("id", id));
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<?> updateUser(HttpServletRequest request, @PathVariable Long id, @RequestBody Map<String, Object> body) {
        if (!isAdmin(request)) {
            return ResponseEntity.status(403).body(Map.of("message", "Admin access required"));
        }

        AppUserDTO currentUser = userRepository.findById(id);
        if (currentUser == null) {
            return ResponseEntity.status(404).body(Map.of("message", "User not found"));
        }

        Long selfId = getCurrentUserId(request);
        boolean isCurrentUser = selfId != null && selfId.equals(id);

        String username = (String) body.getOrDefault("username", "").toString().trim();
        String displayName = (String) body.getOrDefault("display_name", "").toString();
        String email = (String) body.getOrDefault("email", "").toString();
        String role = (String) body.getOrDefault("role", "editor").toString();
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));

        if (username.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "Username is required"));
        }
        if (!"admin".equals(role) && !"editor".equals(role)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid role"));
        }

        // Admin role cannot be changed
        if ("admin".equals(currentUser.role) && !"admin".equals(role)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Administrator role cannot be changed"));
        }

        // Cannot disable yourself
        if (isCurrentUser && !enabled) {
            return ResponseEntity.badRequest().body(Map.of("message", "Cannot disable your own account"));
        }

        // Cannot change role of self
        if (isCurrentUser && !Objects.equals(role, currentUser.role)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Cannot change your own role"));
        }

        userRepository.update(id, username, displayName, email, role, enabled);

        if (isCurrentUser) {
            invalidateCurrentSession(request);
        }

        return ResponseEntity.ok(Map.of("message", "User updated"));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(HttpServletRequest request, @PathVariable Long id) {
        if (!isAdmin(request)) {
            return ResponseEntity.status(403).body(Map.of("message", "Admin access required"));
        }

        Long selfId = getCurrentUserId(request);
        boolean isCurrentUser = selfId != null && selfId.equals(id);

        AppUserDTO user = userRepository.findById(id);
        if (user == null) {
            return ResponseEntity.status(404).body(Map.of("message", "User not found"));
        }

        if (isCurrentUser) {
            return ResponseEntity.badRequest().body(Map.of("message", "Cannot delete your own account"));
        }

        if ("admin".equals(user.role) && Boolean.TRUE.equals(user.enabled)) {
            if (!userRepository.canUserBeDeleted(id)) {
                return ResponseEntity.badRequest().body(Map.of("message", "Cannot delete the last administrator"));
            }
        }

        userRepository.delete(id);

        if (isCurrentUser) {
            invalidateCurrentSession(request);
        }

        return ResponseEntity.ok(Map.of("message", "User deleted"));
    }

    private void invalidateCurrentSession(HttpServletRequest request) {
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("gcd_session".equals(cookie.getName())) {
                    sessionStore.invalidate(cookie.getValue());
                    break;
                }
            }
        }
    }
}
