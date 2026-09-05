package com.gitlabops.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS configuration — allows the React dev server (port 5173) to proxy requests to
 * the Spring API server (port 8090). In production, both are served from the
 * same origin so CORS is not needed.
 */
@Configuration
public class CorsFilterConfig {

    private final Environment env;

    public CorsFilterConfig(Environment env) {
        this.env = env;
    }

    @Bean
    public CorsFilter corsFilter() {
        String activeProfile = env.getProperty("spring.profiles.active", "");
        boolean isDevelopment = activeProfile.isEmpty() || activeProfile.contains("dev")
                || activeProfile.contains("test");

        CorsConfiguration config = new CorsConfiguration();

        if (isDevelopment) {
            config.setAllowedOrigins(java.util.List.of("http://localhost:5173", "http://127.0.0.1:5173"));
            config.setAllowCredentials(true);
        } else {
            config.setAllowedOrigins(java.util.List.of());
            config.setAllowCredentials(false);
        }

        config.setAllowedMethods(java.util.List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(java.util.List.of("*"));
        config.setExposedHeaders(java.util.List.of("Authorization"));
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        source.registerCorsConfiguration("/login", config);

        return new CorsFilter(source);
    }
}