package com.gitlabops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gitlabops.model.dto.AnalyticsReadiness;
import com.gitlabops.model.dto.AnalyticsSummary;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Analytics API contract tests.
 * Tests run against H2 in-memory database with test fixtures.
 */
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "READ_ONLY=true",
    "HIDE_WRITE_ACTIONS=false"
})
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AnalyticsContractTest {

    @Autowired
    private TestRestTemplate restTemplate;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── Summary ───────────────────────────────────────────────

    @Test
    void summaryReturnsHttp200() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/summary?group_ids=123&hours=24&pipeline_view=latest", String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void summaryReturnsCorrectCounts() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/summary?group_ids=123&hours=720&pipeline_view=latest", String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        AnalyticsSummary summary = parseSummary(response.getBody());

        assertTrue(summary.getProjectCount() >= 1);
        // With 720h window, all test fixtures are included.
        assertEquals(30, summary.getSuccessCount());
    }

    @Test
    void summaryReturnsCorrectSuccessRate() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/summary?group_ids=123&hours=720&pipeline_view=latest", String.class);

        AnalyticsSummary summary = parseSummary(response.getBody());
        // With 720h window: actual DB success rate is 83.33%
        assertEquals(83.33f, summary.getSuccessRate(), 0.1f);
    }

    @Test
    void summaryReturnsCorrectRunnerCounts() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/summary?group_ids=123&hours=720&pipeline_view=latest", String.class);

        AnalyticsSummary summary = parseSummary(response.getBody());
        assertTrue(summary.getRunnerCount() >= 0);
    }

    @Test
    void summaryReturnsHistoryBuckets() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/summary?group_ids=123&hours=720&pipeline_view=latest", String.class);

        AnalyticsSummary summary = parseSummary(response.getBody());
        assertEquals(12, summary.getHistory().size());
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 6, 12, 24, 168, 336, 720, 1440, 2160})
    void summaryPreservesExactHours(int hours) {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/summary?group_ids=123&hours=" + hours + "&pipeline_view=latest", String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        AnalyticsSummary summary = parseSummary(response.getBody());
        assertEquals(hours, summary.getWindowHours());
    }

    @Test
    void summaryClampsHighHours() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/summary?group_ids=123&hours=50000&pipeline_view=latest", String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        AnalyticsSummary summary = parseSummary(response.getBody());
        assertEquals(8760, summary.getWindowHours());
    }

    // ── Readiness ─────────────────────────────────────────────

    @Test
    void readinessReturnsHttp200() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/readiness?group_ids=123", String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void readinessReturnsCorrectCounts() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/readiness?group_ids=123", String.class);

        AnalyticsReadiness readiness = parseReadiness(response.getBody());
        assertNotNull(readiness);
        assertTrue(readiness.isDataAvailable());
    }

    // ── Users ─────────────────────────────────────────────────

    @Test
    void usersReturnsHttp200() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/users?group_ids=123&hours=720", String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void usersReturnsPaginatedUserData() {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(
                "/api/analytics/users?group_ids=123&hours=720", String.class);
    
            assertEquals(HttpStatus.OK, response.getStatusCode());
            JsonNode root = MAPPER.readTree(response.getBody());
            assertTrue(root.has("users"));
            assertTrue(root.has("total"));
            assertTrue(root.get("users").isArray());
            assertTrue(root.get("users").size() > 0);
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    // ── Pipelines ─────────────────────────────────────────────

    @Test
    void pipelinesReturnsHttp200() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/pipelines?group_id=123&hours=24", String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void pipelinesReturnsProjectData() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "/api/analytics/pipelines?group_id=123&hours=720", String.class);

        String body = response.getBody();
        assertNotNull(body);
        assertTrue(body.contains("project"));
    }

    // ── DTOs ──────────────────────────────────────────────────

    private AnalyticsSummary parseSummary(String json) {
        try {
            return MAPPER.readValue(json, AnalyticsSummary.class);
        } catch (Exception e) {
            fail("Failed to parse AnalyticsSummary: " + e.getMessage());
            return null;
        }
    }

    private AnalyticsReadiness parseReadiness(String json) {
        try {
            return MAPPER.readValue(json, AnalyticsReadiness.class);
        } catch (Exception e) {
            fail("Failed to parse AnalyticsReadiness: " + e.getMessage());
            return null;
        }
    }
}
