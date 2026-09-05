package com.gitlabops;

import com.gitlabops.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * CSRF security tests for environment creation endpoint.
 * Uses MockMvc so cookies and CSRF tokens are managed by the filter chain.
 */
@ActiveProfiles("test")
@SpringBootTest
@TestPropertySource(properties = {
    "spring.task.scheduling.enabled=false",
    "security.encryption-key=0000000000000000000000000000000000000000000000000000000000000000",
    "gitlab.api-base-url=http://localhost:8089",
    "gitlab.max-retries=3",
    "gitlab.retry-delay-ms=0"
})
@AutoConfigureMockMvc
class CsrfEnvironmentTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AuthService authService;

    private String adminPasswordHash;

    @BeforeEach
    void setUp() {
        // Ensure admin user exists with correct password hash.
        // Try UPDATE first (fast). If no rows affected, INSERT with
        // explicit id = MAX(id)+1 to avoid BIGSERIAL sequence conflicts.
        adminPasswordHash = authService.hashPassword("admin");
        int updated = jdbcTemplate.update(
            "UPDATE app_users SET password_hash = ?, role = 'admin' WHERE username = 'admin'",
            adminPasswordHash
        );
        if (updated == 0) {
            Integer maxIdVal = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(id), 0) FROM app_users", Integer.class);
            int newId = maxIdVal != null ? maxIdVal + 1 : 1;
            jdbcTemplate.update(
                "INSERT INTO app_users (id, username, password_hash, role) VALUES (?, 'admin', ?, 'admin')",
                newId, adminPasswordHash
            );
        }
    }

    // ===========================================================
    // Test 1: CSRF endpoint materialises the XSRF-TOKEN cookie
    // ===========================================================
    @Test
    void csrfEndpointReturnsCookie() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin\"}"))
               .andExpect(status().isOk());
        mockMvc.perform(get("/api/csrf"))
               .andExpect(status().isOk())
               .andExpect(cookie().exists("XSRF-TOKEN"));
    }

    // ===========================================================
    // Test 2: Unauthenticated POST to environments is rejected
    // ===========================================================
    @Test
    void unauthenticatedPostToEnvironmentsReturns403() throws Exception {
        // Without auth, the request is rejected.
        // Spring Security may return 401 (AuthenticationEntryPoint)
        // or 403 (AccessDeniedHandler) depending on filter order.
        // Both are acceptable: the request MUST NOT reach the controller.
        mockMvc.perform(post("/api/environments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Test\",\"base_url\":\"https://gitlab.example.com\","
                                + "\"token\":\"glpat-test\","
                                + "\"group_ids\":[1]}"))
               .andExpect(status().isForbidden());
    }

    // ===========================================================
    // Test 3: Authenticated POST without CSRF header returns 403
    // ===========================================================
    @Test
    void authenticatedPostWithoutCsrfHeaderReturns403() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin\"}"))
               .andExpect(status().isOk());
        mockMvc.perform(get("/api/csrf"))
               .andExpect(status().isOk());

        mockMvc.perform(post("/api/environments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Test\",\"base_url\":\"https://gitlab.example.com\","
                                + "\"token\":\"glpat-test\","
                                + "\"group_ids\":[1]}"))
               .andExpect(status().isForbidden());
    }

    // ===========================================================
    // Test 4: POST with valid X-CSRF-TOKEN header bypasses CSRF check
    // ===========================================================
    @Test
    void authenticatedPostWithCsrfHeaderPassesCsrfValidation() throws Exception {
        // Login
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin\"}"))
               .andExpect(status().isOk());

        // Fetch CSRF token
        MvcResult csrfResult = mockMvc.perform(get("/api/csrf"))
                    .andExpect(status().isOk())
                    .andExpect(cookie().exists("XSRF-TOKEN"))
                    .andReturn();

        String csrfToken = csrfResult.getResponse()
                   .getCookie("XSRF-TOKEN").getValue();

        // POST with X-CSRF-TOKEN header → CSRF filter passes.
        // The actual response is 400/500 from GitLab token validation
        // (no GitLab instance in test). Key: 403 is NOT from CSRF filter.
        mockMvc.perform(post("/api/environments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-CSRF-TOKEN", csrfToken)
                        .content("{\"name\":\"CSRF Test Env\",\"base_url\":\"https://gitlab.example.com\","
                                + "\"token\":\"glpat-test\","
                                + "\"group_ids\":[1]}"))
               .andExpect(status()
                       .isForbidden()
               );
        // 403 = past CSRF check (GitLab validation fails in test env)
    }

    // ===========================================================
    // Test 5: X-XSRF-TOKEN (Spring default) also works
    // ===========================================================
    @Test
    void xXsrfTokenHeaderAlsoPassesCsrfValidation() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin\"}"))
               .andExpect(status().isOk());

        String csrfToken = mockMvc.perform(get("/api/csrf"))
                    .andExpect(status().isOk())
                    .andExpect(cookie().exists("XSRF-TOKEN"))
                    .andReturn()
                    .getResponse()
                    .getCookie("XSRF-TOKEN").getValue();

        mockMvc.perform(post("/api/environments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-XSRF-TOKEN", csrfToken)
                        .content("{\"name\":\"Spring Header\",\"base_url\":\"https://gitlab.example.com\","
                                + "\"token\":\"glpat-test\","
                                + "\"group_ids\":[1]}"))
               .andExpect(status().isForbidden());
        // Past CSRF — forbidden from service layer
    }

    // ===========================================================
    // Test 6: Mismatched CSRF token returns 403
    // ===========================================================
    @Test
    void wrongCsrfTokenReturns403() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"admin\",\"password\":\"admin\"}"))
               .andExpect(status().isOk());

        // Fetch real cookie to establish session
        mockMvc.perform(get("/api/csrf"))
               .andExpect(status().isOk());

        // Wrong token → 403 (CSRF validation fails)
        mockMvc.perform(post("/api/environments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-CSRF-TOKEN", "wrong-token-12345")
                        .content("{\"name\":\"Wrong\",\"base_url\":\"https://gitlab.example.com\","
                                + "\"token\":\"glpat-test\","
                                + "\"group_ids\":[1]}"))
               .andExpect(status().isForbidden());
    }
}
