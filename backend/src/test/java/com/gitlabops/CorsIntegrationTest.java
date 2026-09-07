package com.gitlabops;

import com.gitlabops.config.CorsFilterConfig;
import com.gitlabops.config.SecurityConfig;
import com.gitlabops.config.UiProperties;
import com.gitlabops.controller.AuthController;
import com.gitlabops.repository.AppUserRepository;
import com.gitlabops.service.AuthService;
import com.gitlabops.service.LoginAttemptStore;
import com.gitlabops.service.SessionStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = AuthController.class)
@Import({SecurityConfig.class, CorsFilterConfig.class})
@TestPropertySource(properties = {
    "cors.allowed-origins=https://gitops.appfuxion.com",
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

    @Test
    void loginAllowedOrigin_returnsCorsHeadersAndNotForbiddenCors() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .header("Origin", "https://gitops.appfuxion.com")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(header().string("Access-Control-Allow-Origin", "https://gitops.appfuxion.com"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"))
                .andExpect(status().isUnauthorized()); // Handled by AuthController, not 403 Invalid CORS request
    }

    @Test
    void loginAllowedOriginWithTrailingSlash_returnsCorsHeaders() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .header("Origin", "https://gitops.appfuxion.com/")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(header().string("Access-Control-Allow-Origin", "https://gitops.appfuxion.com/"))
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
                .header("Origin", "https://gitops.appfuxion.com")
                .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://gitops.appfuxion.com"));
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
                .header("Host", "gitops.appfuxion.com")
                .header("Origin", "https://gitops.appfuxion.com")
                .header("X-Forwarded-Proto", "https")
                .header("X-Forwarded-Host", "gitops.appfuxion.com")
                .header("X-Forwarded-Port", "443")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().string(not(containsString("Invalid CORS request"))));
    }
}
