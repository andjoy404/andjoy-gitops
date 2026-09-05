package com.gitlabops.filter;

import com.gitlabops.service.SessionStore;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

public class PasswordChangeRequiredFilter extends OncePerRequestFilter {

    private static final String PASSWORD_CHANGE_REQUIRED_CODE = "PASSWORD_CHANGE_REQUIRED";
    private static final String PASSWORD_CHANGE_REQUIRED_MESSAGE = "Password update required";

    private final SessionStore sessionStore;

    public PasswordChangeRequiredFilter(SessionStore sessionStore) {
        this.sessionStore = sessionStore;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/") || path.startsWith("/api/auth/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String cookieValue = extractSessionCookie(request);

        if (cookieValue != null) {
            SessionStore.SessionInfo session = sessionStore.getSession(cookieValue);
            if (session != null && session.mustChangePassword()) {
                response.setStatus(HttpStatus.FORBIDDEN.value());
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setCharacterEncoding("UTF-8");
                String body = "{\"code\":\"" + PASSWORD_CHANGE_REQUIRED_CODE +
                        "\",\"message\":\"" + PASSWORD_CHANGE_REQUIRED_MESSAGE + "\"}";
                response.getOutputStream().write(body.getBytes("UTF-8"));
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractSessionCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if ("gcd_session".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}