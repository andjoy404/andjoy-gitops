package com.gitlabops.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * CORS configuration supporting configurable allowed origins via
 * CORS_ALLOWED_ORIGINS / cors.allowed-origins, with sensible defaults for
 * local development and integration testing.
 */
@Configuration
public class CorsFilterConfig {

    private final Environment env;

    public CorsFilterConfig(Environment env) {
        this.env = env;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        String activeProfile = env.getProperty("spring.profiles.active", "");
        boolean isDevelopment = activeProfile.isEmpty() || activeProfile.contains("dev")
                || activeProfile.contains("test");

        CorsConfiguration config = new CorsConfiguration();
        List<String> allowedOrigins = new ArrayList<>();

        if (isDevelopment) {
            allowedOrigins.add("http://localhost:5173");
            allowedOrigins.add("http://127.0.0.1:5173");
        }

        String configuredOrigins = env.getProperty("cors.allowed-origins", "");
        if (configuredOrigins.isBlank()) {
            configuredOrigins = System.getenv().getOrDefault("CORS_ALLOWED_ORIGINS", "");
        }

        if (!configuredOrigins.isBlank()) {
            Arrays.stream(configuredOrigins.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .forEach(origin -> {
                        if (!allowedOrigins.contains(origin)) {
                            allowedOrigins.add(origin);
                        }
                        if (origin.endsWith("/")) {
                            String withoutSlash = origin.substring(0, origin.length() - 1);
                            if (!withoutSlash.isEmpty() && !allowedOrigins.contains(withoutSlash)) {
                                allowedOrigins.add(withoutSlash);
                            }
                        } else {
                            String withSlash = origin + "/";
                            if (!allowedOrigins.contains(withSlash)) {
                                allowedOrigins.add(withSlash);
                            }
                        }
                    });
        }

        if (!allowedOrigins.isEmpty()) {
            config.setAllowedOrigins(allowedOrigins);
            config.setAllowCredentials(true);
        } else {
            config.setAllowedOrigins(List.of());
            config.setAllowCredentials(false);
        }

        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of("Authorization", "X-XSRF-TOKEN", "X-CSRF-TOKEN"));
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        return source;
    }
}