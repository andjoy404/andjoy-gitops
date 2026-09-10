package com.gitlabops;

import com.gitlabops.config.CorsFilterConfig;
import com.gitlabops.config.SecurityConfig;
import com.gitlabops.config.UiProperties;
import com.gitlabops.controller.AuthController;
import com.gitlabops.controller.EnvironmentController;
import com.gitlabops.model.dto.AppUserDTO;
import com.gitlabops.repository.AppUserRepository;
import com.gitlabops.service.AuthService;
import com.gitlabops.service.EnvironmentService;
import com.gitlabops.service.GroupService;
import com.gitlabops.service.LoginAttemptStore;
import com.gitlabops.service.SessionStore;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {AuthController.class, EnvironmentController.class})
@Import({SecurityConfig.class, CorsFilterConfig.class})
@TestPropertySource(properties = {
    "cors.allowed-origins=https://gitops.example.com",
    "server.forward-headers-strategy=framework"
})
class CorsIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AppUserRepository userRepository;

    @MockBean
    private SessionStore sessionStore;

    @MockBean
    private AuthService authService;

    @MockBean
    private UiProperties uiProperties;

    @MockBean
    private LoginAttemptStore loginAttemptStore;

    @MockBean
    private EnvironmentService environmentService;

    @MockBean
    private GroupService groupService;

    @MockBean
    private com.gitlabops.repository.EnvironmentRepository environmentRepository;

    @MockBean
    private com.gitlabops.service.CustomOidcUserService customOidcUserService;

    @MockBean
    private com.gitlabops.filter.OidcAuthenticationSuccessHandler oidcSuccessHandler;

    @MockBean
    private com.gitlabops.filter.OidcAuthenticationFailureHandler oidcFailureHandler;

    @MockBean
    private com.gitlabops.config.DynamicClientRegistrationRepository clientRegistrationRepository;

    @Test
    void loginAllowedOrigin_returnsCorsHeadersAndNotForbiddenCors() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .header("Origin", "https://gitops.example.com")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(header().string("Access-Control-Allow-Origin", "https://gitops.example.com"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(status().isUnauthorized()); // Handled by AuthController, not 403 Invalid CORS request
    }

    @Test
    void loginAllowedOriginWithTrailingSlash_returnsCorsHeaders() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .header("Origin", "https://gitops.example.com/")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(header().string("Access-Control-Allow-Origin", "https://gitops.example.com/"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginUnauthorizedOrigin_returns403InvalidCorsRequest() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .header("Origin", "https://evil.example.com")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(status().isForbidden())
                .andExpect(content().string(containsString("Invalid CORS request")));
    }

    @Test
    void optionsPreflightAllowedOrigin_returnsOk() throws Exception {
        mockMvc.perform(options("/api/auth/login")
                .header("Origin", "https://gitops.example.com")
                .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://gitops.example.com"));
    }

    @Test
    void loginDirectAccessNoOrigin_isNotRejectedByCors() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized()) // Not 403 Forbidden
                .andExpect(content().string(not(containsString("Invalid CORS request"))));
    }

    @Test
    void loginSimulatingProxyForwardedHeaders_succeedsCors() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .header("Host", "gitops.example.com")
                .header("Origin", "https://gitops.example.com")
                .header("X-Forwarded-Proto", "https")
                .header("X-Forwarded-Host", "gitops.example.com")
                .header("X-Forwarded-Port", "443")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().string(not(containsString("Invalid CORS request"))));
    }

    @Test
    void loginSuccessThenAccessEnvironments_authenticated() throws Exception {
        AppUserDTO user = new AppUserDTO();
        user.id = 1L;
        user.username = "admin";
        user.passwordHash = "hash123";
        user.role = "admin";
        user.mustChangePassword = false;
        when(userRepository.findByUsername("admin")).thenReturn(user);
        when(authService.verifyPassword("admin123", "hash123")).thenReturn(true);
        when(sessionStore.createSession(1L, "admin", "admin", false)).thenReturn("token-abc-123");
        when(sessionStore.getSession("token-abc-123")).thenReturn(
                new SessionStore.SessionInfo(1L, "admin", "admin", false, System.currentTimeMillis(), System.currentTimeMillis()));

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                .header("Host", "gitops.example.com")
                .header("Origin", "https://gitops.example.com")
                .header("X-Forwarded-Proto", "https")
                .header("X-Forwarded-Host", "gitops.example.com")
                .header("X-Forwarded-Port", "443")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn();

        Cookie[] cookies = loginResult.getResponse().getCookies();
        assertNotNull(cookies);
        Cookie sessionCookie = null;
        for (Cookie c : cookies) {
            if ("gcd_session".equals(c.getName())) {
                sessionCookie = c;
            }
        }
        assertNotNull(sessionCookie);
        System.out.println("DEBUG: sessionCookie.isSecure() = " + sessionCookie.getSecure());
        System.out.println("DEBUG: sessionCookie.getPath() = " + sessionCookie.getPath());
        System.out.println("DEBUG: sessionCookie.getValue() = " + sessionCookie.getValue());

        // Now perform GET /api/environments with that cookie
        mockMvc.perform(get("/api/environments")
                .header("Host", "gitops.example.com")
                .header("Origin", "https://gitops.example.com")
                .header("X-Forwarded-Proto", "https")
                .header("X-Forwarded-Host", "gitops.example.com")
                .header("X-Forwarded-Port", "443")
                .cookie(sessionCookie))
                .andExpect(status().isOk());
    }
}
