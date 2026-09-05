package com.gitlabops;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import com.gitlabops.service.AuthService;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * MockMvc-based integration test for the forced password change flow.
 *
 * Exercises the real HTTP boundary:
 *   Mock HTTP -> Spring MVC (AuthController) -> AuthService(Argon2dPasswordEncoder)
 * -> AppUserRepository(jOOQ) -> PostgreSQL (in test profile)
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
class PasswordChangeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String sessionCookie;
    private static final String testUsername = "testpwuser";
    private static final String testPassword = "TestPass123!";

    private void ensureTestUser() throws Exception {
        var authService = new AuthService();
        String hash = authService.hashPassword(testPassword);

        jdbcTemplate.update(
            "INSERT INTO app_users(id, username, password_hash, display_name, email, role, enabled, must_change_password, created_at, updated_at) "
            + "VALUES(1, ?, ?, 'Test User', 'test@example.com', 'editor', true, true, NOW(), NOW()) "
            + "ON CONFLICT(id) DO UPDATE SET "
            + "username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, "
            + "display_name = EXCLUDED.display_name, email = EXCLUDED.email, "
            + "role = EXCLUDED.role, enabled = EXCLUDED.enabled, "
            + "must_change_password = EXCLUDED.must_change_password, "
            + "created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at",
            testUsername, hash);

        var loginResult = mockMvc.perform(
                post("/api/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"" + testUsername + "\",\"password\":\"" + testPassword + "\"}")
        )
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.must_change_password").value(true))
        .andReturn();

        sessionCookie = loginResult.getResponse().getCookie("gcd_session").getValue();
        assertNotNull(sessionCookie, "Session cookie should be set after login");
    }

    @BeforeEach
    void setUp() throws Exception {
        ensureTestUser();
    }

    @AfterEach
    void tearDown() throws Exception {
        jdbcTemplate.update("DELETE FROM app_users WHERE username = ?", testUsername);
        jdbcTemplate.update("DELETE FROM app_users WHERE username = ?", "admin");
    }

    // ===========================================================
    // Forced password change tests
    // ===========================================================

    @Test
    void forcedPasswordChange_returns204AndRotatesSession() throws Exception {
        mockMvc.perform(
                put("/api/auth/password")
                    .cookie(new Cookie("gcd_session", sessionCookie))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"newPassword\":\"NewSecurePass123\"}")
        )
        .andExpect(status().isNoContent())
        // Verify new session cookie is set (cookie rotation)
        .andExpect(cookie().exists("gcd_session"));

        // Verify password was updated and must_change_password is false
        int count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM app_users WHERE username = ? AND must_change_password = false",
            Integer.class, testUsername);
        assertEquals(1, count, "must_change_password should be false after password change");

        // Verify password hash changed to a valid argon2d hash
        String hash = jdbcTemplate.queryForObject(
            "SELECT password_hash FROM app_users WHERE username = ?", String.class, testUsername);
        assertTrue(hash != null && hash.startsWith("$argon2d$v=19$m=65536,t=3,p=1$"),
            "Password hash should be a valid argon2d hash starting with $argon2d$v=19");
    }

    @Test
    void forcedPasswordChange_shortPassword_returns400() throws Exception {
        mockMvc.perform(
                put("/api/auth/password")
                    .cookie(new Cookie("gcd_session", sessionCookie))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"newPassword\":\"short\"}")
        )
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("8 characters")));
    }

    @Test
    void forcedPasswordChange_nullPassword_returnsBadRequest() throws Exception {
        mockMvc.perform(
                put("/api/auth/password")
                    .cookie(new Cookie("gcd_session", sessionCookie))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"nothing\":\"useless\"}")
        )
        .andExpect(status().isBadRequest());
    }

    @Test
    void forcedPasswordChange_unauthenticated_returnsUnauthorized() throws Exception {
        mockMvc.perform(
                put("/api/auth/password")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"newPassword\":\"newSecurePass\"}")
        )
        .andExpect(status().isUnauthorized());
    }

    @Test
    void forcedPasswordChange_invalidSession_returnsUnauthorized() throws Exception {
        mockMvc.perform(
                put("/api/auth/password")
                    .cookie(new Cookie("gcd_session", "nonexistent-token"))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"newPassword\":\"newSecurePass\"}")
        )
        .andExpect(status().isUnauthorized());
    }
}
