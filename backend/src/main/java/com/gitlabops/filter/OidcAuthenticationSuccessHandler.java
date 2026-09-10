package com.gitlabops.filter;

import com.gitlabops.config.SecurityConfig;
import com.gitlabops.service.SessionStore;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

@Component
public class OidcAuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(OidcAuthenticationSuccessHandler.class);

    private final SessionStore sessionStore;
    private final com.gitlabops.repository.AppUserRepository userRepository;

    public OidcAuthenticationSuccessHandler(SessionStore sessionStore,
                                           com.gitlabops.repository.AppUserRepository userRepository) {
        this.sessionStore = sessionStore;
        this.userRepository = userRepository;
        this.setDefaultTargetUrl("/");
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                         HttpServletResponse response,
                                         Authentication authentication)
            throws ServletException, java.io.IOException {

        String targetUrl = determineTargetUrl(request, response, authentication);

        if (response.isCommitted()) {
            log.debug("Response already committed, skipping redirect to {}", targetUrl);
            return;
        }

        String sub = null;
        String email = null;
        if (authentication.getPrincipal() instanceof OidcUser oidcUser) {
            sub = oidcUser.getAttribute("sub");
            email = oidcUser.getAttribute("email");
        }

        com.gitlabops.model.dto.AppUserDTO appUser = null;
        if (sub != null) {
            appUser = userRepository.findByProviderUserId(sub);
        }
        if (appUser == null && email != null) {
            appUser = userRepository.findByEmail(email);
        }

        Long userId = appUser != null ? appUser.id : null;
        String username = appUser != null ? appUser.username : extractUsername(authentication);
        String role = appUser != null && appUser.role != null ? appUser.role : extractRole(authentication);

        String sessionId = sessionStore.createSession(
            userId, username, role, false);

        Cookie cookie = new Cookie("gcd_session", sessionId);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        boolean isSecure = SecurityConfig.isSecure(request);
        cookie.setSecure(isSecure);
        cookie.setMaxAge(com.gitlabops.controller.AuthController.getSessionCookieMaxAge());
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);

        clearAuthenticationAttributes(request);

        response.setStatus(HttpStatus.FOUND.value());
        response.setHeader("Location", targetUrl);
        response.flushBuffer();
    }

    private String extractUsername(Authentication authentication) {
        if (authentication.getPrincipal() instanceof OidcUser oidcUser) {
            return oidcUser.getAttribute("sub");
        }
        return authentication.getName();
    }

    private String extractRole(Authentication authentication) {
        for (var authority : authentication.getAuthorities()) {
            if ("ROLE_ADMIN".equals(authority.getAuthority())) {
                return "admin";
            }
            if ("ROLE_VIEWER".equals(authority.getAuthority())) {
                return "editor";
            }
        }
        return "editor";
    }
}
