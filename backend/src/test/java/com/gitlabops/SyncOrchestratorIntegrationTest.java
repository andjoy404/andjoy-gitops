package com.gitlabops;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gitlabops.service.AnalyticsSyncService;
import com.gitlabops.service.AnalyticsSyncStorage;
import com.gitlabops.service.EncryptionService;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Phase 5.2 orchestrator integration tests with WireMock for mock GitLab API.
 *
 * Executes the full sync pipeline through the real HTTP boundary:
 * Mock HTTP -> GitLabApiClient (RestTemplate) -> AnalyticsSyncService -> Storage -> H2
 */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "spring.task.scheduling.enabled=false",
    "gitlab.api-base-url=http://localhost:8089",
    "gitlab.max-retries=3",
    "gitlab.retry-delay-ms=0",
    "security.encryption-key=0000000000000000000000000000000000000000000000000000000000000000"
})
class SyncOrchestratorIntegrationTest {

    @LocalServerPort
    private int appPort;

    @Autowired
    private AnalyticsSyncService syncService;

    @Autowired
    private AnalyticsSyncStorage syncStorage;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EncryptionService encryptionService;

    @Autowired
    private MeterRegistry meterRegistry;

    private WireMockServer wireMock;
    private static final int WIREMOCK_PORT = 8089;
    private static final int SYNC_GROUP_NS = 1;
    private static final long SYNC_ENCODED_GROUP = 17592186044493L;
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    @BeforeEach
    void setUp() throws Exception {
        wireMock = new WireMockServer(WireMockConfiguration.options().port(WIREMOCK_PORT));
        wireMock.start();
        seedMockResponses();
        encryptAndSeedEnvironment("test-token-not-real");
        clearTestTables();
    }

    @AfterEach
    void tearDown() {
        if (wireMock != null) wireMock.stop();
    }

    private void encryptAndSeedEnvironment(String token) throws Exception {
        byte[] encryptedToken = encryptionService.encrypt(token);
        // Build PostgreSQL array literal — encoded group = (1 << 44 | 77) = 17592186044493
        String pgArray = "'{17592186044493}'::bigint[]";
        String sql = "INSERT INTO gitlab_environments(namespace_id, name, base_url, token_ciphertext, group_ids, enabled) "
                + "VALUES(?, ?, ?, ?, " + pgArray + ", ?) "
                + "ON CONFLICT (namespace_id) DO UPDATE SET "
                + "base_url = EXCLUDED.base_url, token_ciphertext = EXCLUDED.token_ciphertext, "
                + "group_ids = EXCLUDED.group_ids, enabled = TRUE";
        jdbcTemplate.update(sql, SYNC_GROUP_NS, "Mock Env",
                "http://localhost:" + WIREMOCK_PORT,
                encryptedToken, true);
    }

    private void clearTestTables() {
        jdbcTemplate.execute("DELETE FROM analytics_jobs WHERE gitlab_id >= 5000");
        jdbcTemplate.execute("DELETE FROM analytics_pipelines WHERE gitlab_id >= 5000");
        jdbcTemplate.execute("DELETE FROM analytics_projects WHERE gitlab_id >= 500");
        jdbcTemplate.execute("DELETE FROM analytics_runner_state WHERE group_id = 17592186044493");
        jdbcTemplate.execute("DELETE FROM analytics_sync_state WHERE scope = 'pipelines'");
    }

    private String toJson(Object obj) throws Exception {
        return JSON_MAPPER.writeValueAsString(obj);
    }

    private Map<String, Object> mkProject(long id, String name, String branch, List<String> topics) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", id);
        p.put("name", name);
        p.put("path", name);
        p.put("web_url", "https://gitlab.example.com/group/" + name);
        p.put("default_branch", branch);
        p.put("jobs_enabled", true);
        p.put("topics", topics);
        return p;
    }

    private Map<String, Object> mkPipeline(long id, String branch, String status, String source) {
        String now = java.time.Instant.now().toString();
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", id);
        p.put("iid", 1L);
        p.put("project_id", id < 5005L ? 501L : 502L);
        p.put("sha", "abc123");
        p.put("ref", branch);
        p.put("status", status);
        p.put("source", source);
        p.put("created_at", now);
        p.put("updated_at", now);
        p.put("web_url", "https://gitlab.example.com/pipelines/" + id);
        p.put("author_id", 100L);
        return p;
    }

    private Map<String, Object> mkJob(long id, String name, String stage, String status) {
        String now = java.time.Instant.now().toString();
        Map<String, Object> j = new LinkedHashMap<>();
        j.put("id", id);
        j.put("name", name);
        j.put("stage", stage);
        j.put("status", status);
        j.put("ref", "main");
        j.put("allow_failure", false);
        j.put("created_at", now);
        j.put("web_url", "https://gitlab.example.com/jobs/" + id);
        return j;
    }

    private Map<String, Object> mkRunner(long id, String description) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", id);
        r.put("description", description);
        r.put("status", "online");
        r.put("is_shared", false);
        r.put("runner_type", "group_type");
        return r;
    }

    private void seedMockResponses() throws Exception {
        List<Map<String, Object>> projList = List.of(
            mkProject(501L, "web-app", "main", List.of("web", "frontend")),
            mkProject(502L, "api-service", "main", List.of("api", "backend")),
            mkProject(503L, "worker", "main", List.of("workers"))
        );

        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/77/projects.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withHeader("x-total", "3")
                        .withBody(toJson(projList))));

        // Pipelines for project 501 - page 1 (no page param)
        wireMock.stubFor(WireMock.get(WireMock.urlPathEqualTo("/api/v4/projects/501/pipelines"))
                .withQueryParam("page", WireMock.absent())
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "2")
                        .withBody(toJson(List.of(
                                mkPipeline(5001L, "main", "success", "push"),
                                mkPipeline(5002L, "main", "running", "push"))))));

        // Pipelines for project 501 - page 2
        wireMock.stubFor(WireMock.get(WireMock.urlPathEqualTo("/api/v4/projects/501/pipelines"))
                .withQueryParam("page", WireMock.equalTo("2"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "2")
                        .withBody(toJson(List.of(
                                mkPipeline(5003L, "develop", "failed", "merge_request_event"))))));

        // Pipelines for project 502 (1 page)
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/502/pipelines.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(mkPipeline(5010L, "main", "success", "push"))))));

        // Jobs for pipeline 5001
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/501/pipelines/5001/jobs.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(
                                mkJob(1001L, "build", "build", "success"),
                                mkJob(1002L, "test", "test", "success"),
                                mkJob(1003L, "deploy", "deploy", "success"))))));

        // Jobs for pipeline 5002
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/501/pipelines/5002/jobs.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(mkJob(1010L, "build", "build", "running"))))));

        // Jobs for pipeline 5003
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/501/pipelines/5003/jobs.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(
                                mkJob(1020L, "compile", "compile", "success"),
                                mkJob(1021L, "test", "test", "failed"))))));

        // Jobs for pipeline 5010
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/502/pipelines/5010/jobs.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(mkJob(1030L, "build", "build", "success"))))));

        // Group object + subgroup discovery (required by the runner fetch chain)
        wireMock.stubFor(WireMock.get(WireMock.urlPathEqualTo("/api/v4/groups/77"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody(toJson(Map.of(
                                "id", 77L,
                                "name", "Mock Group",
                                "full_path", "mock-group")))));
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/77/descendant_groups.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody("[]")));

        // Runners
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/77/runners.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(
                                mkRunner(201L, "build-runner-1"),
                                mkRunner(202L, "deploy-runner-1"))))));

        // Runner details (used to enrich runner state payload)
        for (long rid : List.of(201L, 202L)) {
            wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/runners/" + rid + ".*"))
                    .willReturn(WireMock.aResponse()
                            .withHeader("Content-Type", "application/json")
                            .withBody(toJson(mkRunner(rid, "runner-" + rid)))));
        }

        // Group/project members and events - empty
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/77/members.*"))
                .willReturn(WireMock.aResponse().withHeader("Content-Type", "application/json").withBody("[]")));
        for (int pid : List.of(501, 502, 503)) {
            wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/" + pid + "/members.*"))
                    .willReturn(WireMock.aResponse().withHeader("Content-Type", "application/json")
                            .withBody("[]")));
            wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/" + pid + "/events.*"))
                    .willReturn(WireMock.aResponse().withHeader("Content-Type", "application/json")
                            .withBody("[]")));
        }

        // Pipelines for project 503 - empty
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/503/pipelines.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "0")
                        .withBody("[]")));
    }

    private int rowCount(String sql) {
        Integer c = jdbcTemplate.queryForObject(sql, Integer.class);
        return c != null ? c : 0;
    }

    @Test
    void completeSyncThroughRealHttpBoundary() throws Exception {
        AnalyticsSyncService.SyncResult result = syncService.syncAll();
        System.out.println("SYNC RESULT: success=" + result.success() 
            + " msg=" + result.message()
            + " projects=" + result.projectsSynced()
            + " pipelines=" + result.pipelinesSynced()
            + " jobs=" + result.jobsSynced());
        assertTrue(result.success(), "Sync succeeded: " + result.message());

        int actualProjectCount = rowCount("SELECT COUNT(*) FROM analytics_projects WHERE gitlab_id IN (501, 502, 503)");
        System.out.println("PROJECT COUNT after sync: " + actualProjectCount);

        assertEquals(3, actualProjectCount,
            "3 projects persisted");

        Integer pipelineCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE project_id IN (501, 502)", Integer.class);
        assertNotNull(pipelineCount);
        assertTrue(pipelineCount >= 4, "Expected >=4 pipelines: got " + pipelineCount);

        Integer jobCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM analytics_jobs", Integer.class);
        assertNotNull(jobCount);
        assertTrue(jobCount >= 5, "Expected >=5 jobs: got " + jobCount);

        Integer runnerCount = rowCount(
                "SELECT COUNT(*) FROM analytics_runner_state WHERE group_id = 17592186044493");
        System.out.println("RUNNER STATE COUNT: " + runnerCount);
        assertEquals(1, runnerCount, "Runner state should be persisted for group 17592186044493");
    }

    @Test
    void paginationPersistPage2Plus() throws Exception {
        syncService.syncAll();

        Integer page2 = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE gitlab_id = 5003", Integer.class);
        assertEquals(1, page2, "Pipeline 5003 from page 2 must be persisted");

        Integer page1 = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE gitlab_id IN (5001, 5002)", Integer.class);
        assertEquals(2, page1, "Page 1 pipelines must be persisted");

        Integer total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE project_id IN (501, 502)", Integer.class);
        assertNotNull(total);
        assertEquals(4, total, "Total pipelines = page1 + page2");

        assertEquals(3, rowCount("SELECT COUNT(*) FROM analytics_projects WHERE gitlab_id IN (501, 502, 503)"));
    }

    @Test
    void orchestratorIdempotency() throws Exception {
        syncService.syncAll();
        int p1 = rowCount("SELECT COUNT(*) FROM analytics_projects WHERE gitlab_id >= 501");
        int pi1 = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE project_id IN (501, 502)", Integer.class);
        int j1 = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM analytics_jobs", Integer.class);

        syncService.syncAll();
        int p2 = rowCount("SELECT COUNT(*) FROM analytics_projects WHERE gitlab_id >= 501");
        int pi2 = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE project_id IN (501, 502)", Integer.class);
        int j2 = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM analytics_jobs", Integer.class);

        assertEquals(p1, p2, "Projects unchanged on second sync");
        assertEquals(pi1, pi2, "Pipelines unchanged on second sync");
        assertEquals(j1, j2, "Jobs unchanged on second sync");
    }

    @Test
    void orchestratorUpdateSync() throws Exception {
        // --- Sync #1: initial state ---
        syncService.syncAll();

        String topics1 = jdbcTemplate.queryForObject(
                "SELECT topics FROM analytics_projects WHERE gitlab_id = 501", String.class);
        assertEquals("[\"web\", \"frontend\"]", topics1);

        String pipelineStatus1 = jdbcTemplate.queryForObject(
                "SELECT status FROM analytics_pipelines WHERE gitlab_id = 5002", String.class);
        assertEquals("running", pipelineStatus1);

        String jobStatus1 = jdbcTemplate.queryForObject(
                "SELECT status FROM analytics_jobs WHERE gitlab_id = 1010", String.class);
        assertEquals("running", jobStatus1);

        // --- Override mocks: updated data ---
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/77/projects.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(
                                mkProject(501L, "web-app", "main", List.of("web", "updated")),
                                mkProject(502L, "api-service", "main", List.of("api", "backend")),
                                mkProject(503L, "worker", "main", List.of("workers")))))));

        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/501/pipelines.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "2")
                        .withBody(toJson(List.of(
                                mkPipeline(5001L, "main", "success", "push"),
                                mkPipeline(5002L, "main", "success", "push"))))));

        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/501/pipelines/5001/jobs.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(
                                mkJob(1001L, "build", "build", "success"),
                                mkJob(1002L, "test", "test", "success"),
                                mkJob(1003L, "deploy", "deploy", "success"))))));

        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/501/pipelines/5002/jobs.*"))
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withHeader("x-total-pages", "1")
                        .withBody(toJson(List.of(mkJob(1010L, "build", "build", "success"))))));

        // --- Sync #2: updated state ---
        syncService.syncAll();

        // Verify project topics updated
        String topics2 = jdbcTemplate.queryForObject(
                "SELECT topics FROM analytics_projects WHERE gitlab_id = 501", String.class);
        assertEquals("[\"web\", \"updated\"]", topics2);

        // Verify pipeline status transitioned
        String pipelineStatus2 = jdbcTemplate.queryForObject(
                "SELECT status FROM analytics_pipelines WHERE gitlab_id = 5002", String.class);
        assertEquals("success", pipelineStatus2);

        // Verify job status transitioned
        String jobStatus2 = jdbcTemplate.queryForObject(
                "SELECT status FROM analytics_jobs WHERE gitlab_id = 1010", String.class);
        assertEquals("success", jobStatus2);

        // Verify no duplicates
        assertEquals(1, rowCount("SELECT COUNT(*) FROM analytics_projects WHERE gitlab_id = 501"));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE gitlab_id = 5002", Integer.class));
        assertEquals(1, jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_jobs WHERE gitlab_id = 1010", Integer.class));
    }

    @Test
    void http429RetryThenSuccess() throws Exception {
        // Scenario: first call returns 429, subsequent calls return 200
        wireMock.stubFor(WireMock.any(WireMock.urlPathMatching("/api/v4/groups/77/members/all.*"))
                .inScenario("429-Retry")
                .whenScenarioStateIs("STARTED")
                .willReturn(WireMock.aResponse()
                        .withStatus(429)
                        .withHeader("Content-Type", "application/json")
                        .withHeader("Retry-After", "1"))
                .willSetStateTo("RETRY_OK"));

        wireMock.stubFor(WireMock.any(WireMock.urlPathMatching("/api/v4/groups/77/members/all.*"))
                .inScenario("429-Retry")
                .whenScenarioStateIs("RETRY_OK")
                .willReturn(WireMock.aResponse()
                        .withHeader("Content-Type", "application/json")
                        .withBody(toJson(Collections.emptyList()))));

        AnalyticsSyncService.SyncResult result = syncService.syncAll();

        assertTrue(result.success(), "Sync should succeed after 429 retry");

        // Verify retry was attempted
        Counter retryCounter = meterRegistry.find("sync.gitlab.retry").counter();
        assertNotNull(retryCounter);
        assertTrue(retryCounter.count() >= 1, "Should have at least 1 retry for 429");
    }

    @Test
    void http429RetryExhausted() throws Exception {
        // Always return 429 on members endpoint — retries will be exhausted
        wireMock.stubFor(WireMock.any(WireMock.urlPathMatching("/api/v4/groups/77/members/all.*"))
                .willReturn(WireMock.aResponse()
                        .withStatus(429)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"message\":\"Too Many Requests\",\"errors\":{\"message\":\"Rate limited\"}}")));

        AnalyticsSyncService.SyncResult result = syncService.syncAll();

        // Sync continues despite member endpoint failures (caught by syncGroup)
        assertTrue(result.success(), "Sync should proceed despite member 429 (other endpoints succeed)");

        // Verify retry and error metrics were recorded
        Counter retryCounter = meterRegistry.find("sync.gitlab.retry").counter();
        assertNotNull(retryCounter);
        long retryCount = (long) retryCounter.count();
        assertTrue(retryCount > 0, "Should have retried on 429");

        Counter errorCounter = meterRegistry.find("sync.gitlab.error")
                .tag("status", "rate_limited").counter();
        assertNotNull(errorCounter);
        assertTrue(errorCounter.count() > 0, "Should record rate_limited error after retries exhausted");
    }

    @Test
    void http401Unauthorized() throws Exception {
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/77/projects.*"))
                .willReturn(WireMock.aResponse()
                        .withStatus(401)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"message\":\"401 Unauthorized\"}")));

        AnalyticsSyncService.SyncResult result = syncService.syncAll();
        assertNotNull(result);
    }

    @Test
    void http403Forbidden() throws Exception {
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/77/projects.*"))
                .willReturn(WireMock.aResponse()
                        .withStatus(403)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"message\":\"403 Forbidden\"}")));

        AnalyticsSyncService.SyncResult result = syncService.syncAll();
        assertNotNull(result);
    }

    @Test
    void http500InternalServerError() throws Exception {
        wireMock.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/77/projects.*"))
                .willReturn(WireMock.aResponse()
                        .withStatus(500)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"message\":\"Internal Server Error\"}")));

        AnalyticsSyncService.SyncResult result = syncService.syncAll();
        assertNotNull(result);
    }
}
