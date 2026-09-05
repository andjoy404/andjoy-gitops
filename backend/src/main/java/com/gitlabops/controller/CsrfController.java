package com.gitlabops.controller;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;

import com.gitlabops.config.SecurityConfig;

/**
 * Provides Spring-managed CSRF token for SPA clients.
 *
 * In production with same-origin deployment, the browser sends cookies automatically.
 * The CSRF token must be matched between cookie and header.
 *
 * The XSRF-TOKEN cookie is readable by JavaScript (HttpOnly=false) so the
 * frontend can extract it and send as X-CSRF-TOKEN header.
 *
 * The Secure flag follows the SESSION_SECURE environment variable:
 *   SESSION_SECURE=true  → Secure cookie (HTTPS only)
 *   SESSION_SECURE=false → Non-Secure cookie (works over local HTTP)
 */
@RestController
@RequestMapping("/api")
public class CsrfController {

    /**
     * GET /api/csrf — Materialize the CSRF token as an XSRF-TOKEN cookie.
     *
     * Spring Security's HttpSessionCsrfTokenRepository generates/loads the
     * CsrfToken from the HTTP session. This controller copies it into the
     * XSRF-TOKEN cookie for easy JavaScript extraction.
     */
    @GetMapping("/csrf")
    public void csrfToken(CsrfToken token, HttpServletResponse response) {
        Cookie cookie = new Cookie("XSRF-TOKEN", token.getToken());
        cookie.setPath("/");
        cookie.setHttpOnly(false);

        // Respect SESSION_SECURE env var:
        //   false = local HTTP works (cookie not Secure)
        //   true  = HTTPS only (cookie Secure)
        boolean secure = SecurityConfig.isSecure();
        cookie.setSecure(secure); // Session cookie, setSecure=false for local http

        // Session cookie — no max-age (expires on browser close)
        response.addCookie(cookie);
        response.setStatus(HttpStatus.OK.value());
    }
}
