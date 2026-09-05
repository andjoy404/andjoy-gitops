package com.gitlabops.config;

import com.gitlabops.filter.SessionAuthenticationFilter;
import com.gitlabops.service.SessionStore;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.firewall.StrictHttpFirewall;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;

/**
 * Shared security configuration supporting both the SecurityFilterChain
 * and runtime helpers (e.g. CSRF cookie Secure flag).
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /**
     * Determines whether cookies should be marked Secure.
     * True when SESSION_SECURE=true (HTTPS production).
     * False for local HTTP development.
     */
    public static boolean isSecure() {
        String secure = System.getProperty("SESSION_SECURE", System.getenv("SESSION_SECURE"));
        return "true".equalsIgnoreCase(secure);
    }

    /**
     * Custom CSRF token request handler that accepts both
     * X-XSRF-TOKEN (Spring default) and X-CSRF-TOKEN (frontend api.ts).
     */
    private static class DualCsrfTokenRequestHandler implements CsrfTokenRequestHandler {
        private static final String SPRING_HEADER = "X-XSRF-TOKEN";
        private static final String FRONTEND_HEADER = "X-CSRF-TOKEN";

        private final CsrfTokenRequestAttributeHandler primary;

        DualCsrfTokenRequestHandler(CsrfTokenRequestAttributeHandler primary) {
            this.primary = primary;
        }

        @Override
        public void handle(jakarta.servlet.http.HttpServletRequest request,
                           jakarta.servlet.http.HttpServletResponse response,
                           java.util.function.Supplier<org.springframework.security.web.csrf.CsrfToken> csrfToken) {
            primary.handle(request, response, csrfToken);
        }

        @Override
        public String resolveCsrfTokenValue(
                jakarta.servlet.http.HttpServletRequest request,
                org.springframework.security.web.csrf.CsrfToken csrfToken) {
            // Try Spring default first
            String token = request.getHeader(SPRING_HEADER);
            if (StringUtils.hasText(token)) return token;
            // Then frontend api.ts
            token = request.getHeader(FRONTEND_HEADER);
            if (StringUtils.hasText(token)) return token;
            return primary.resolveCsrfTokenValue(request, csrfToken);
        }
    }

    @Bean
    public SessionAuthenticationFilter sessionAuthFilter(SessionStore sessionStore) {
        return new SessionAuthenticationFilter(sessionStore);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
            SessionAuthenticationFilter sessionAuthFilter) throws Exception {

        StrictHttpFirewall firewall = new StrictHttpFirewall();
        firewall.setAllowSemicolon(true);

        // Configure CookieCsrfTokenRepository to store CSRF tokens in cookie.
        // HttpOnly=false so JavaScript (SPA) can read XSRF-TOKEN from document.cookie.
        CookieCsrfTokenRepository tokenRepository = new CookieCsrfTokenRepository();
        tokenRepository.setCookiePath("/");
        tokenRepository.setCookieHttpOnly(false);
        tokenRepository.setCookieName("XSRF-TOKEN");

        // Base handler that stores token in request attribute
        CsrfTokenRequestAttributeHandler baseHandler = new CsrfTokenRequestAttributeHandler();

        // Custom handler that checks both X-XSRF-TOKEN and X-CSRF-TOKEN headers
        CsrfTokenRequestHandler dualHandler = new DualCsrfTokenRequestHandler(baseHandler);

        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(tokenRepository)
                        .csrfTokenRequestHandler(dualHandler)
                        .ignoringRequestMatchers("/api/auth/login",
                                "/api/auth/status",
                                "/api/auth/password",
                                "/health",
                                "/metrics/prometheus")
                )
                .headers(headers -> headers
                        .contentTypeOptions(HeadersConfigurer.ContentTypeOptionsConfig::disable)
                        .frameOptions(HeadersConfigurer.FrameOptionsConfig::sameOrigin)
                        .referrerPolicy(ref -> ref.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                )
                .securityContext(ctx -> ctx
                        .requireExplicitSave(false)
                )
                .addFilterBefore(sessionAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/health", "/metrics/prometheus").permitAll()
                        .requestMatchers("/api/auth/login", "/api/auth/logout", "/api/auth/password").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/auth/status",
                                "/api/csrf",
                                "/api/analytics/**",
                                "/api/jobs/**",
                                "/api/projects/**",
                                "/api/graph/**",
                                "/api/pipelines/**",
                                "/api/version").permitAll()
                        .requestMatchers("/api/environments/**").authenticated()
                        .requestMatchers("/api/config").authenticated()
                        .requestMatchers("/api/users/**").authenticated()
                        .requestMatchers("/api/sync/**").authenticated()
                        .requestMatchers("/api/preferences/**").authenticated()
                        .requestMatchers("/", "/index.html", "/favicon.ico",
                                "/andjoy-gitops-logo.ico", "/andjoy-gitops-logo.png",
                                "/assets/**", "/robots.txt", "/manifest.json")
                                .permitAll()
                        .anyRequest().authenticated()
                )
                .sessionManagement(sm -> sm
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType("application/json");
                            response.getWriter().write("{\"error\":\"Unauthorized\"}");
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            response.setStatus(HttpStatus.FORBIDDEN.value());
                            response.setContentType("application/json");
                            response.getWriter().write("{\"error\":\"Forbidden\"}");
                        })
                );

        return http.build();
    }
}
