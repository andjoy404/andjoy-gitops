package com.gitlabops.config;

import com.gitlabops.filter.OidcAuthenticationFailureHandler;
import com.gitlabops.filter.OidcAuthenticationSuccessHandler;
import com.gitlabops.filter.SessionAuthenticationFilter;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.service.CustomOidcUserService;
import com.gitlabops.service.SessionStore;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.firewall.StrictHttpFirewall;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * Shared security configuration supporting both the SecurityFilterChain
 * and runtime helpers (e.g. CSRF cookie Secure flag).
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    private final EnvironmentRepository environmentRepository;
    private final DynamicClientRegistrationRepository clientRegistrationRepository;

    public SecurityConfig(EnvironmentRepository environmentRepository,
                          DynamicClientRegistrationRepository clientRegistrationRepository) {
        this.environmentRepository = environmentRepository;
        this.clientRegistrationRepository = clientRegistrationRepository;
    }

    /**
     * Determines whether cookies should be marked Secure.
     * True when SESSION_SECURE=true (HTTPS production).
     * False for local HTTP development.
     */
    public static boolean isSecure() {
        String secure = System.getProperty("SESSION_SECURE", System.getenv("SESSION_SECURE"));
        if (secure != null && !secure.isBlank()) {
            return "true".equalsIgnoreCase(secure);
        }
        String profile = System.getProperty("spring.profiles.active", System.getenv("SPRING_PROFILES_ACTIVE"));
        return "production".equalsIgnoreCase(profile);
    }

    /**
     * Determines whether cookies should be marked Secure, taking into account
     * whether the incoming request is HTTPS (including forwarded protocol from reverse proxy).
     */
    public static boolean isSecure(jakarta.servlet.http.HttpServletRequest request) {
        return (request != null && request.isSecure()) || isSecure();
    }

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
            String token = request.getHeader(SPRING_HEADER);
            if (StringUtils.hasText(token)) return token;
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
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SessionAuthenticationFilter sessionAuthFilter,
            CorsConfigurationSource corsConfigurationSource,
            CustomOidcUserService customOidcUserService,
            OidcAuthenticationSuccessHandler oidcSuccessHandler,
            OidcAuthenticationFailureHandler oidcFailureHandler,
            ClientRegistrationRepository clientRegistrationRepository) throws Exception {

        StrictHttpFirewall firewall = new StrictHttpFirewall();
        firewall.setAllowSemicolon(true);

        CookieCsrfTokenRepository tokenRepository = new CookieCsrfTokenRepository();
        tokenRepository.setCookiePath("/");
        tokenRepository.setCookieHttpOnly(false);
        tokenRepository.setCookieName("XSRF-TOKEN");

        CsrfTokenRequestAttributeHandler baseHandler = new CsrfTokenRequestAttributeHandler();
        CsrfTokenRequestHandler dualHandler = new DualCsrfTokenRequestHandler(baseHandler);

        boolean ssoEnabled = false;
        try {
            var ssoConfig = environmentRepository.getGlobalConfig();
            if (ssoConfig.isPresent()) {
                ssoEnabled = Boolean.TRUE.equals(ssoConfig.get().isSsoEnabled());
            }
        } catch (Exception e) {
            log.debug("Could not load SSO config for security chain: {}", e.getMessage());
        }

        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf
                        .csrfTokenRepository(tokenRepository)
                        .csrfTokenRequestHandler(dualHandler)
                        .ignoringRequestMatchers("/api/auth/login",
                                "/api/auth/status",
                                "/api/auth/password",
                                "/api/auth/profile",
                                "/api/auth/config",
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
                        .requestMatchers("/api/auth/login", "/api/auth/logout",
                                "/api/auth/password", "/api/auth/profile", "/api/auth/config").permitAll()
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

        if (ssoEnabled) {
            http.oauth2Login(oauth2 -> {
                oauth2.clientRegistrationRepository(clientRegistrationRepository);
                oauth2.loginPage("/auth/oidc");
                oauth2.userInfoEndpoint(userInfo ->
                    userInfo.oidcUserService(customOidcUserService));
                oauth2.successHandler(oidcSuccessHandler);
                oauth2.failureHandler(oidcFailureHandler);
            });
        }

        return http.build();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logOidcStatus() {
        try {
            var ssoConfig = environmentRepository.getGlobalConfig();
            boolean ssoEnabled = ssoConfig.isPresent() && Boolean.TRUE.equals(ssoConfig.get().isSsoEnabled());
            log.info("SSO/OIDC status: {}", ssoEnabled ? "ENABLED" : "DISABLED");
        } catch (Exception e) {
            log.debug("Could not determine SSO status: {}", e.getMessage());
        }
    }
}
