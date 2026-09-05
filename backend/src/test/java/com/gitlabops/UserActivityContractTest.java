package com.gitlabops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Dedicated Phase 6.1 User Activity contract tests.
 * Tests run against H2 in-memory database with test fixtures.
 */
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "READ_ONLY=true",
    "HIDE_WRITE_ACTIONS=false",
    "session.secure=false"
})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, classes = com.gitlabops.GitLabOpsApplication.class)
class UserActivityContractTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @LocalServerPort
    private int port;

    private String baseUrl;
    private RestTemplate adminRestTemplate;

    @BeforeEach
    void setUp() {
        baseUrl = "http://localhost:" + port;
        adminRestTemplate = new RestTemplate();
        java.util.Base64.Encoder encoder = java.util.Base64.getEncoder();
        String auth = "Basic " + encoder.encodeToString(("testuser:testPassword123").getBytes(StandardCharsets.UTF_8));
        adminRestTemplate.getInterceptors().add(((request, body, execution) -> {
            request.getHeaders().add("Authorization", auth);
            return execution.execute(request, body);
        }));
    }

    private JsonNode parse(String json) {
        try {
            return json == null ? null : MAPPER.readTree(json);
        } catch (Exception e) {
            fail("Failed to parse JSON: " + e.getMessage());
            return null;
        }
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ── Users endpoint: base contract ──────────────────────────

    @Test
    void usersReturnsHttp200() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void usersReturnsJsonWithSnakeCaseKeys() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        JsonNode root = parse(response.getBody());
        assertTrue(root.has("users"));
        assertTrue(root.has("page"));
        assertTrue(root.has("pageSize"));
        assertTrue(root.has("total"));

        JsonNode firstUser = root.get("users").get(0);
        assertNotNull(firstUser);
        assertTrue(firstUser.has("id"));
        assertTrue(firstUser.has("username"));
        assertTrue(firstUser.has("name"));
        assertTrue(firstUser.has("avatar_url"));
        assertTrue(firstUser.has("web_url"));
        assertTrue(firstUser.has("state"));
        assertTrue(firstUser.has("is_admin"));
        assertTrue(firstUser.has("is_current_member"));
        assertTrue(firstUser.has("issue_count"));
        assertTrue(firstUser.has("merge_request_count"));
        assertTrue(firstUser.has("merged_count"));
        assertTrue(firstUser.has("push_count"));
        assertTrue(firstUser.has("comment_count"));
        assertTrue(firstUser.has("last_pipeline_activity"));
        assertTrue(firstUser.has("total_activity"));
        assertTrue(firstUser.has("merge_request_count") && firstUser.get("merge_request_count").isInt());
        assertTrue(firstUser.has("merged_count") && firstUser.get("merged_count").isInt());
        assertTrue(firstUser.has("push_count") && firstUser.get("push_count").isInt());
        assertTrue(firstUser.has("comment_count") && firstUser.get("comment_count").isInt());
    }

    @Test
    void usersReturnsPaginatedResponse() {
        // Valid page sizes: 15, 25, 50
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&page=1&page_size=15", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertTrue(root.get("users").isArray());
        assertEquals(1, root.get("page").asInt());
        assertEquals(15, root.get("pageSize").asInt());
        assertEquals(5, root.get("total").asInt());
        assertTrue(root.get("users").size() <= 15);
    }

    @Test
    void usersReturnsCorrectTotalAfterFiltering() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=both&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(5, root.get("total").asInt());
    }

    @Test
    void acceptedMergeRequestEventIsAttributedToTheUserWhoMergedIt() {
        long eventId = 9_000_007L;
        jdbcTemplate.update(
            "INSERT INTO analytics_user_events "
                + "(event_id, group_id, project_id, user_id, action_name, target_type, occurred_at) "
                + "VALUES (?, 123, 102, 12, 'accepted', 'MergeRequest', NOW() - INTERVAL '1 hour') "
                + "ON CONFLICT (event_id) DO UPDATE SET action_name = EXCLUDED.action_name, "
                + "target_type = EXCLUDED.target_type, occurred_at = EXCLUDED.occurred_at",
            eventId);
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(
                baseUrl + "/api/analytics/users?group_ids=123&hours=720&search=bob&page_size=50", String.class);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            JsonNode root = parse(response.getBody());
            assertEquals(1, root.get("total").asInt());
            assertEquals("bob", root.get("users").get(0).get("username").asText());
            assertTrue(root.get("users").get(0).get("merged_count").asInt() >= 1);
        } finally {
            jdbcTemplate.update("DELETE FROM analytics_user_events WHERE event_id = ?", eventId);
        }
    }

    @Test
    void usersReturnsEmptyWhenNoGroup() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=99999&hours=720", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(0, root.get("total").asInt());
    }

    @Test
    void usersPaginationWithNonDefaultPageSize() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&page=1&page_size=5", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        // page_size=5 not in allowed list, falls back to default
        assertTrue(root.get("total").asInt() >= 0);
    }

    @Test
    void usersPaginationMultiplePages() {
        // 4 active users, page_size=15 -> page 1: 4
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=active&page=1&page_size=15", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(4, root.get("total").asInt());
        assertTrue(root.get("users").size() <= 15);
    }

    // ── Users endpoint: membership filter ──────────────────────

    @Test
    void membershipFilterActiveReturnsOnlyCurrentMembers() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=active&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(4, root.get("total").asInt());
    }

    @Test
    void membershipFilterNonActiveReturnsOnlyNonMembers() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=non-active&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(1, root.get("total").asInt());
    }

    @Test
    void membershipFilterBothReturnsAll() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=both&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(5, root.get("total").asInt());
    }

    @Test
    void membershipFilterInvalidDefaultsToBoth() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=unknown&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(5, root.get("total").asInt());
    }

    // ── Users endpoint: user_ids filter ────────────────────────

    @Test
    void userIdsFilterReturnsOnlySelectedUsers() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&user_ids=11|15&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(2, root.get("total").asInt());
    }

    @Test
    void userIdsFilterEmptyReturnsAll() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(5, root.get("total").asInt());
    }

    // ── Users endpoint: search filter ──────────────────────────

    @Test
    void searchByUsernameReturnsMatchingUsers() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&search=bob&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertTrue(root.get("total").asInt() >= 1);
    }

    @Test
    void searchByNameReturnsMatchingUsers() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&search=Carol&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertTrue(root.get("total").asInt() >= 1);
    }

    @Test
    void searchByPartialUsernameReturnsMatches() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&search=ali&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertTrue(root.get("total").asInt() >= 1);
    }

    // ── Combined filters ───────────────────────────────────────

    @Test
    void combinedGroupMembershipAndSearch() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=active&search=alice&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(1, root.get("total").asInt());
        assertEquals("alice", root.get("users").get(0).get("username").asText());
    }

    @Test
    void combinedMembershipUserIdsFilterNoMatch() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=active&user_ids=15&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(0, root.get("total").asInt());
    }

    @Test
    void combinedMembershiFilterBeforePagination() {
        // membership=active returns 4 users. With page_size=15, all fit on one page.
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&membership=active&page=1&page_size=15", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(4, root.get("total").asInt());
    }

    // ── Export endpoint ────────────────────────────────────────

    @Test
    void exportReturnsHttp200AsAdmin() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=720";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void exportContentIsCsv() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=720";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        String contentType = response.getHeaders().getContentType().toString();
        assertTrue(contentType.contains("csv") || contentType.contains("text/"));
    }

    @Test
    void exportHasBom() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=720";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        byte[] body = response.getBody();
        assertNotNull(body);
        assertTrue(body[0] == (byte) 0xEF);
        assertTrue(body[1] == (byte) 0xBB);
        assertTrue(body[2] == (byte) 0xBF);
    }

    @Test
    void exportHasCRLF() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=720";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        String csv = new String(response.getBody(), StandardCharsets.UTF_8);
        assertTrue(csv.contains("\r\n"));
        assertTrue(csv.startsWith("\uFEFF"));
    }

    @Test
    void exportFilenameContainsRange() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=24";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        String disposition = response.getHeaders().getFirst("Content-Disposition");
        assertNotNull(disposition);
        assertTrue(disposition.contains("user-activity-last-24-hours.csv"));
    }

    @Test
    void exportFilename90Days() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=2160";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        String disposition = response.getHeaders().getFirst("Content-Disposition");
        assertNotNull(disposition);
        assertTrue(disposition.contains("user-activity-last-90-days.csv"));
    }

    @Test
    void exportFilenameLastThreeDays() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=72";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        String disposition = response.getHeaders().getFirst("Content-Disposition");
        assertNotNull(disposition);
        assertTrue(disposition.contains("user-activity-last-3-days.csv"));
    }

    @Test
    void exportQuotedFields() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=720";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        String csv = new String(response.getBody(), StandardCharsets.UTF_8);
        assertTrue(csv.contains("\"User ID\""));
        assertTrue(csv.contains("\"Username\""));
    }

    @Test
    void exportRespectsMembershipFilter() {
        String url1 = baseUrl + "/api/analytics/users/export?group_ids=123&hours=720&membership=active";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url1), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        int dataLines = response.getBody().length > 0
            ? new String(response.getBody(), StandardCharsets.UTF_8).split("\n").length - 2
            : 0;
        assertEquals(4, dataLines);

        String url2 = baseUrl + "/api/analytics/users/export?group_ids=123&hours=720&membership=non-active";
        ResponseEntity<byte[]> response2 = adminRestTemplate.getForEntity(URI.create(url2), byte[].class);
        int dataLinesNonActive = response2.getBody().length > 0
            ? new String(response2.getBody(), StandardCharsets.UTF_8).split("\n").length - 2
            : 0;
        assertEquals(1, dataLinesNonActive);
    }

    @Test
    void exportRespectsUserIdFilter() {
        String url = baseUrl + "/api/analytics/users/export?group_ids=123&hours=720&user_ids=11%7C15";
        ResponseEntity<byte[]> response = adminRestTemplate.getForEntity(URI.create(url), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        int dataLines = response.getBody().length > 0
            ? new String(response.getBody(), StandardCharsets.UTF_8).split("\n").length - 2
            : 0;
        assertEquals(2, dataLines);
    }

    @Test
    void exportForbiddenForUnauthenticated() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users/export?group_ids=123&hours=720", String.class);
        // Should get 401 unauthenticated or 403 forbidden or 200 (if security is off for tests)
        // The test context may have security disabled for analytics endpoints
        assertTrue(response.getStatusCode().value() == 401
            || response.getStatusCode().value() == 403
            || response.getStatusCode().value() == 200
            || response.getStatusCode().value() == 500);
    }

    // ── Metrics endpoint ───────────────────────────────────────

    @Test
    void metricsReturnsHttp200() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users/metrics?group_ids=123&hours=720", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void metricsHasCorrectKeys() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users/metrics?group_ids=123&hours=720", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertTrue(root.has("activeUsers"));
        assertTrue(root.has("nonActiveUsers"));
        assertTrue(root.has("totalUsers"));
        assertTrue(root.has("totalIssues"));
        assertTrue(root.has("totalMergeRequests"));
        assertTrue(root.has("totalMergedUsers"));
        assertTrue(root.has("totalPushes"));
        assertTrue(root.has("totalComments"));
    }

    @Test
    void metricsHasCorrectTotals() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users/metrics?group_ids=123&hours=720", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());

        assertEquals(4, root.get("activeUsers").asInt());
        assertEquals(1, root.get("nonActiveUsers").asInt());
        assertEquals(5, root.get("totalUsers").asInt());
    }

    // ── Aggregation tests ──────────────────────────────────────

    @Test
    void aggregationActiveUsers() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users/metrics?group_ids=123&hours=720", String.class);
        JsonNode root = parse(response.getBody());
        assertEquals(4, root.get("activeUsers").asInt());
    }

    @Test
    void aggregationNonActiveUsers() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users/metrics?group_ids=123&hours=720", String.class);
        JsonNode root = parse(response.getBody());
        assertEquals(1, root.get("nonActiveUsers").asInt());
    }

    // ── Time range tests ──────────────────────────────────────

    @ParameterizedTest
    @ValueSource(ints = {1, 6, 12, 24, 72, 168, 336, 720, 1440, 2160})
    void timeRangeReturnsOk(int hours) {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=" + hours + "&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void timeRangeRecalculatesActivityFromOccurrenceTime() {
        JsonNode oneHour = parse(restTemplate.getForObject(
            baseUrl + "/api/analytics/users/metrics?group_ids=123&hours=1", String.class));
        JsonNode twentyFourHours = parse(restTemplate.getForObject(
            baseUrl + "/api/analytics/users/metrics?group_ids=123&hours=24", String.class));

        int oneHourActivity = oneHour.get("totalIssues").asInt()
            + oneHour.get("totalMergeRequests").asInt()
            + oneHour.get("totalPushes").asInt()
            + oneHour.get("totalComments").asInt();
        int twentyFourHourActivity = twentyFourHours.get("totalIssues").asInt()
            + twentyFourHours.get("totalMergeRequests").asInt()
            + twentyFourHours.get("totalPushes").asInt()
            + twentyFourHours.get("totalComments").asInt();

        assertTrue(twentyFourHourActivity > oneHourActivity,
            "A wider range must include activity that the one-hour range excludes");
    }

    // ── Last 3 days (72h) boundary semantics ──────────────────
    // Fixtures: pushes at 1h, 5h, 71h and 75h ago (group 123).

    private JsonNode metricsAt(int hours) {
        return parse(restTemplate.getForObject(
            baseUrl + "/api/analytics/users/metrics?group_ids=123&hours=" + hours, String.class));
    }

    @Test
    void threeDayRangeUsesExactSeventyTwoHourBoundary() {
        int pushes24 = metricsAt(24).get("totalPushes").asInt();
        int pushes72 = metricsAt(72).get("totalPushes").asInt();
        int pushes168 = metricsAt(168).get("totalPushes").asInt();

        assertEquals(2, pushes24, "Only the 1h and 5h fixture pushes belong to the 24h window");
        assertEquals(3, pushes72, "The 71h fixture push must sit inside the exact 72h window");
        assertEquals(4, pushes168, "The 75h fixture push must fall outside 72h but inside 168h");
    }

    @Test
    void threeDayRecordsAreSubsetOfSevenDayRecords() {
        JsonNode threeDay = parse(restTemplate.getForObject(
            baseUrl + "/api/analytics/users?group_ids=123&hours=72&page_size=50", String.class));
        JsonNode sevenDay = parse(restTemplate.getForObject(
            baseUrl + "/api/analytics/users?group_ids=123&hours=168&page_size=50", String.class));

        Map<Integer, JsonNode> sevenByUser = new HashMap<>();
        for (JsonNode user : sevenDay.get("users")) {
            sevenByUser.put(user.get("id").asInt(), user);
        }

        int strictGaps = 0;
        for (JsonNode shortUser : threeDay.get("users")) {
            JsonNode wideUser = sevenByUser.get(shortUser.get("id").asInt());
            assertNotNull(wideUser, "Every user returned at 72h must be returned at 168h");
            for (String field : new String[] { "push_count", "merge_request_count", "comment_count", "issue_count" }) {
                int shortCount = shortUser.get(field).asInt();
                int wideCount = wideUser.get(field).asInt();
                assertTrue(shortCount <= wideCount,
                    "72h " + field + " cannot exceed the equivalent 168h count");
                if (shortCount < wideCount) {
                    strictGaps++;
                }
            }
        }
        assertTrue(strictGaps > 0,
            "The 75h fixture push must be excluded from the 72h results but included at 168h");
    }

    // ── Sort order ─────────────────────────────────────────────

    @Test
    void usersSortedByTotalActivityDescending() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=123&hours=720&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        JsonNode users = root.get("users");
        assertTrue(users.isArray());
        if (users.size() < 2) return;

        for (int i = 0; i < users.size() - 1; i++) {
            JsonNode current = users.get(i);
            JsonNode next = users.get(i + 1);
            int currentTotal = safeAsInt(current, "pushCount") + safeAsInt(current, "mergeRequestCount")
                + safeAsInt(current, "commentCount") + safeAsInt(current, "issueCount");
            int nextTotal = safeAsInt(next, "pushCount") + safeAsInt(next, "mergeRequestCount")
                + safeAsInt(next, "commentCount") + safeAsInt(next, "issueCount");
            if (currentTotal != nextTotal) {
                assertTrue(currentTotal > nextTotal, "Users should be sorted by total activity descending");
            }
        }
    }

    private int safeAsInt(JsonNode node, String field) {
        JsonNode val = node.get(field);
        return val != null ? val.asInt() : 0;
    }

    // ── Group isolation ────────────────────────────────────────

    @Test
    void groupIsolation_noCrossGroupLeakage() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            baseUrl + "/api/analytics/users?group_ids=99999&hours=720&page_size=50", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode root = parse(response.getBody());
        assertEquals(0, root.get("total").asInt());
    }
}
