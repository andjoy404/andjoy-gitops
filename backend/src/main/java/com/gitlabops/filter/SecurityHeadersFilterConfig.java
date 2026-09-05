package com.gitlabops.filter;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Adds security headers to all non-health/static responses.
 * Registered as Bean to ensure proper ordering before Spring Security headers.
 */
@Configuration
public class SecurityHeadersFilterConfig {

    public static class SecurityHeadersFilter extends OncePerRequestFilter {
        @Override
        protected boolean shouldNotFilter(HttpServletRequest request) {
            String path = request.getRequestURI();
            return path.startsWith("/health")
                    || path.startsWith("/metrics/")
                    || path.endsWith(".css")
                    || path.endsWith(".js")
                    || path.endsWith(".png")
                    || path.endsWith(".jpg")
                    || path.endsWith(".svg")
                    || path.endsWith(".woff")
                    || path.endsWith(".woff2")
                    || path.endsWith(".ico")
                    || path.startsWith("/static/");
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request,
                                        HttpServletResponse response,
                                        FilterChain filterChain) throws ServletException, IOException {
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("X-Frame-Options", "DENY");
            response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

            String csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
                    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
                    "connect-src 'self'; frame-ancestors 'none'; " +
                    "base-uri 'self'; form-action 'self';";
            response.setHeader("Content-Security-Policy", csp);

            response.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

            filterChain.doFilter(request, response);
        }
    }

    @Bean
    public FilterRegistrationBean<SecurityHeadersFilter> securityHeadersFilterRegistration() {
        FilterRegistrationBean<SecurityHeadersFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new SecurityHeadersFilter());
        registration.addUrlPatterns("/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        registration.setName("securityHeadersFilter");
        return registration;
    }
}
