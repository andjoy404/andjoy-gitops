package com.gitlabops.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Tests for HTTP 415 (Unsupported Media Type) handling in GlobalExceptionHandler.
 * Ensures that non-JSON requests to JSON-consuming endpoints return 415, not 500.
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
class MediaTypeHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void passwordChangeWithTextPlain_returns415() throws Exception {
        mockMvc.perform(
                put("/api/auth/password")
                    .contentType(MediaType.TEXT_PLAIN)
                    .content("newPassword=weak")
        )
        .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void passwordChangeWithFormUrlEncoded_returns415() throws Exception {
        mockMvc.perform(
                put("/api/auth/password")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .content("newPassword=testpass123")
        )
        .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void passwordChangeWithNoContentType_returns415() throws Exception {
        mockMvc.perform(
                put("/api/auth/password")
                    .content("some plain text body")
        )
        .andExpect(status().isUnsupportedMediaType());
    }

    @Test
    void passwordChangeWithValidJson_succeedsOrFailsAuthNot415() throws Exception {
        // Valid JSON → must NOT return 415.
        // Without a valid session, it returns 401.
        mockMvc.perform(
                put("/api/auth/password")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"newPassword\":\"short\"}")
        )
        .andExpect(status().isUnauthorized());
    }
}
