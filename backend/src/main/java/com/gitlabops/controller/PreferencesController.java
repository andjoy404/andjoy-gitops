package com.gitlabops.controller;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gitlabops.repository.PreferencesRepository;
import com.gitlabops.service.SessionStore;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class PreferencesController {

    private final PreferencesRepository preferencesRepository;
    private final SessionStore sessionStore;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PreferencesController(PreferencesRepository preferencesRepository,
                                 SessionStore sessionStore) {
        this.preferencesRepository = preferencesRepository;
        this.sessionStore = sessionStore;
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

    @GetMapping("/preferences")
    public ResponseEntity<Map<String, Object>> getPreferences(HttpServletRequest request) {
        Long userId = getCurrentUserId(request);
        if (userId == null) {
            return ResponseEntity.ok(Map.of(
                "theme", "light",
                "favorite_projects", Map.of()
            ));
        }

        String theme = preferencesRepository.getTheme(userId);
        ObjectNode favorites = preferencesRepository.getFavorites(userId);

        return ResponseEntity.ok(Map.of(
            "theme", theme,
            "favorite_projects", favorites
        ));
    }

    @PutMapping("/preferences/theme")
    public ResponseEntity<Void> saveTheme(
            HttpServletRequest request,
            @RequestBody Map<String, String> body) {
        String theme = body.get("theme");
        if (theme == null || (!"light".equals(theme) && !"dark".equals(theme))) {
            return ResponseEntity.badRequest().build();
        }

        Long userId = getCurrentUserId(request);
        if (userId == null) {
            return ResponseEntity.status(401).build();
        }

        preferencesRepository.saveTheme(userId, theme);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/preferences/favorites")
    public ResponseEntity<Void> saveFavorites(
            HttpServletRequest request,
            @RequestBody Map<String, Object> body) {
        Long userId = getCurrentUserId(request);
        if (userId == null) {
            return ResponseEntity.status(401).build();
        }

        ObjectNode favoriteProjects;
        if (body.containsKey("favorite_projects")) {
            Object favObj = body.get("favorite_projects");
            try {
                String json = objectMapper.writeValueAsString(favObj);
                favoriteProjects = (ObjectNode) objectMapper.readTree(json);
            } catch (Exception e) {
                return ResponseEntity.badRequest().build();
            }
        } else {
            favoriteProjects = objectMapper.createObjectNode();
        }

        if (!favoriteProjects.isObject()) {
            return ResponseEntity.badRequest().build();
        }

        preferencesRepository.saveFavorites(userId, favoriteProjects);
        return ResponseEntity.noContent().build();
    }
}
