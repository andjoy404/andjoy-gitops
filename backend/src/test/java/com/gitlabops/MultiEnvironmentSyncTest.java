package com.gitlabops;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gitlabops.service.AnalyticsSyncService;
import com.gitlabops.service.EncryptionService;
import com.gitlabops.util.FederatedIdUtility;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.verification.LoggedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression: every sync fetch must be routed to the environment that owns the
 * group's namespace. A secondary environment's group must be read through its own
 * URL/token, never through the primary environment's client (clients.get(0)).
 *
 * <p>Two WireMock servers simulate two GitLab instances. Each instance serves the
 * same group id (500) but a distinct native project, so their persisted rows do
 * not collide on the gitlab_id primary key. The two instances are told apart by
 * the PRIVATE-TOKEN header each environment carries; routing is verified by that
 * token plus a full per-instance cross-traffic audit of every logged request.
 */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "spring.task.scheduling.enabled=false",
    "gitlab.api-base-url=http://localhost:7101",
    "gitlab.max-retries=1",
    "gitlab.retry-delay-ms=0",
    "security.encryption-key=0000000000000000000000000000000000000000000000000000000000000000"
})
class MultiEnvironmentSyncTest {

    private static final long NS_MULTIPLIER = 1L << 44;
    private static final int PRIMARY_PORT = 7101;
    private static final int SECONDARY_PORT = 7102;
    private static final String PRIMARY_TOKEN = "primary-env-token";
    private static final String SECONDARY_TOKEN = "secondary-env-token";
    private static final long GROUP_ID = 500L;
    // gitlab_environments.group_ids stores native GitLab ids; analytics rows are keyed
    // by the native id, and the frontend's federated selection is decoded to it on read.
    private static final long SECONDARY_FEDERATED_GROUP = NS_MULTIPLIER + GROUP_ID; // as sent by the UI
    private static final long PRIMARY_PROJECT = 6001L;
    private static final long SECONDARY_PROJECT = 7001L;
    private static final long USER_ID = 7001L;
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private AnalyticsSyncService syncService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EncryptionService encryptionService;

    private WireMockServer primary;
    private WireMockServer secondary;

    @BeforeEach
    void setUp() throws Exception {
        primary = new WireMockServer(WireMockConfiguration.options().port(PRIMARY_PORT));
        primary.start();
        secondary = new WireMockServer(WireMockConfiguration.options().port(SECONDARY_PORT));
        secondary.start();
        stubGitLab(primary, PRIMARY_PROJECT);
        stubGitLab(secondary, SECONDARY_PROJECT);
        seedEnvironments();
        clearTestTables();
    }

    @AfterEach
    void tearDown() {
        if (primary != null) primary.stop();
        if (secondary != null) secondary.stop();
    }

    private void seedEnvironments() throws Exception {
        // The fixture DB pre-seeds a third environment (ns=1, base_url
        // https://gitlab.example.com, NULL token) — remove it so only the two
        // environments under test stay active.
        jdbcTemplate.update("DELETE FROM gitlab_environments WHERE base_url = 'https://gitlab.example.com'");

        byte[] primaryCipher = encryptionService.encrypt(PRIMARY_TOKEN);
        byte[] secondaryCipher = encryptionService.encrypt(SECONDARY_TOKEN);
        String onConflict = "ON CONFLICT (namespace_id) DO UPDATE SET "
                + "base_url = EXCLUDED.base_url, token_ciphertext = EXCLUDED.token_ciphertext, "
                + "group_ids = EXCLUDED.group_ids, enabled = TRUE";
        jdbcTemplate.update(
                "INSERT INTO gitlab_environments(namespace_id, name, base_url, token_ciphertext, group_ids, enabled) "
                        + "VALUES(0, 'Primary Mock', ?, ?, '{" + GROUP_ID + "}'::bigint[], TRUE) " + onConflict,
                "http://localhost:" + PRIMARY_PORT, primaryCipher);
        jdbcTemplate.update(
                "INSERT INTO gitlab_environments(namespace_id, name, base_url, token_ciphertext, group_ids, enabled) "
                        + "VALUES(1, 'Secondary Mock', ?, ?, '{" + GROUP_ID + "}'::bigint[], TRUE) " + onConflict,
                "http://localhost:" + SECONDARY_PORT, secondaryCipher);
    }

    private void clearTestTables() {
        jdbcTemplate.execute("DELETE FROM analytics_jobs WHERE gitlab_id >= 600000");
        jdbcTemplate.execute("DELETE FROM analytics_pipelines WHERE gitlab_id >= 60000");
        jdbcTemplate.execute("DELETE FROM analytics_projects WHERE gitlab_id IN (6001, 7001)");
        jdbcTemplate.update(
                "DELETE FROM analytics_runner_state WHERE group_id = ?",
                GROUP_ID);
        jdbcTemplate.execute("DELETE FROM analytics_user_events WHERE project_id IN (6001, 7001)");
        jdbcTemplate.execute("DELETE FROM analytics_user_issues WHERE project_id IN (6001, 7001)");
        jdbcTemplate.execute("DELETE FROM analytics_user_activity WHERE user_id = 7001");
        jdbcTemplate.execute("DELETE FROM analytics_users WHERE gitlab_id = 7001");
    }

    private void stubGitLab(WireMockServer server, long projectId) throws Exception {
        long pipelineId = projectId * 10L;
        long jobId = projectId * 100L;
        String now = java.time.Instant.now().toString();

        Map<String, Object> project = Map.of(
                "id", projectId,
                "name", "proj-" + projectId,
                "path", "proj-" + projectId,
                "web_url", "http://localhost/project/" + projectId,
                "default_branch", "main",
                "jobs_enabled", true,
                "topics", List.of());
        Map<String, Object> pipeline = Map.of(
                "id", pipelineId,
                "iid", 1L,
                "project_id", projectId,
                "sha", "abc123",
                "ref", "main",
                "status", "success",
                "source", "push",
                "created_at", now,
                "web_url", "http://localhost/pipelines/" + pipelineId,
                "author_id", USER_ID);
        Map<String, Object> job = Map.of(
                "id", jobId,
                "name", "build",
                "stage", "build",
                "status", "success",
                "ref", "main",
                "allow_failure", false,
                "created_at", now,
                "web_url", "http://localhost/jobs/" + jobId);
        Map<String, Object> member = Map.of(
                "id", USER_ID,
                "username", "member",
                "name", "Member",
                "state", "active");
        Map<String, Object> runner = Map.of(
                "id", 8001L + projectId / 1000L,
                "description", "runner-" + projectId,
                "status", "online",
                "is_shared", false,
                "runner_type", "group_type");

        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/500/projects.*"))
                .willReturn(j(json(page(project)))));
        server.stubFor(WireMock.get(WireMock.urlPathEqualTo("/api/v4/projects/" + projectId + "/pipelines"))
                .willReturn(j(json(page(pipeline)))));
        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/" + projectId
                + "/pipelines/" + pipelineId + "/jobs.*"))
                .willReturn(j(json(page(job)))));
        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/500/descendant_groups.*"))
                .willReturn(j("[]")));
        server.stubFor(WireMock.get(WireMock.urlPathEqualTo("/api/v4/groups/500"))
                .willReturn(j(json(Map.of(
                        "id", GROUP_ID,
                        "name", "Shared Name Group",
                        "full_path", "shared-name-group")))));
        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/500/runners.*"))
                .willReturn(j(json(page(runner)))));
        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/runners/" + (8001L + projectId / 1000L) + ".*"))
                .willReturn(j(json(Map.of(
                        "id", 8001L + projectId / 1000L,
                        "description", "runner-" + projectId,
                        "status", "online",
                        "is_shared", false,
                        "runner_type", "group_type")))));
        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/groups/500/members.*"))
                .willReturn(j(json(List.of(member)))));
        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/" + projectId + "/members.*"))
                .willReturn(j(json(List.of(member)))));
        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/" + projectId + "/events.*"))
                .willReturn(j("[]")));
        server.stubFor(WireMock.get(WireMock.urlPathMatching("/api/v4/projects/" + projectId + "/issues.*"))
                .willReturn(j("[]")));
    }

    private String json(Object obj) throws Exception {
        return JSON.writeValueAsString(obj);
    }

    /** Wrap an item in the {"data":[...]} envelope parseBodyIntoResult accepts. */
    private Object page(Object item) {
        return Map.of("data", List.of(item), "total_pages", 1);
    }

    private ResponseDefinitionBuilder j(String body) {
        return WireMock.aResponse()
                .withHeader("Content-Type", "application/json")
                .withHeader("x-total-pages", "1")
                .withBody(body);
    }

    private int rowCount(String sql, Object... args) {
        Integer c = jdbcTemplate.queryForObject(sql, Integer.class, args);
        return c != null ? c : 0;
    }

    /**
     * Before the fix, the secondary environment's group was read through the
     * primary's client (clients.get(0)). Group 500 exists on both instances, so
     * pre-fix the secondary's pipelines/jobs were fetched from the primary's URL
     * and its data never matched the secondary project. After the fix every
     * request for a given environment carries that environment's own token.
     */
    @Test
    void eachEnvironmentIsRoutedToItsOwnGitLabInstance() throws Exception {
        AnalyticsSyncService.SyncResult result = syncService.syncAll();
        assertTrue(result.success(), "Sync succeeded: " + result.message());

        // Both environments served their own group through the real HTTP boundary.
        primary.verify(WireMock.getRequestedFor(WireMock.urlPathMatching("/api/v4/groups/500/projects.*"))
                .withHeader("PRIVATE-TOKEN", WireMock.equalTo(PRIMARY_TOKEN)));
        secondary.verify(WireMock.getRequestedFor(WireMock.urlPathMatching("/api/v4/groups/500/projects.*"))
                .withHeader("PRIVATE-TOKEN", WireMock.equalTo(SECONDARY_TOKEN)));

        // The secondary environment's pipelines and jobs must be read from the
        // secondary instance — the exact calls that 404'd on the primary pre-fix.
        secondary.verify(WireMock.getRequestedFor(
                        WireMock.urlPathEqualTo("/api/v4/projects/" + SECONDARY_PROJECT + "/pipelines"))
                .withHeader("PRIVATE-TOKEN", WireMock.equalTo(SECONDARY_TOKEN)));
        secondary.verify(WireMock.getRequestedFor(
                        WireMock.urlPathMatching("/api/v4/projects/" + SECONDARY_PROJECT
                                + "/pipelines/" + SECONDARY_PROJECT * 10L + "/jobs.*"))
                .withHeader("PRIVATE-TOKEN", WireMock.equalTo(SECONDARY_TOKEN)));

        // Cross-traffic audit: every request each instance received carried that
        // instance's own environment token. A pre-fix primary-routed fetch would
        // show the primary token on the secondary instance (or vice versa).
        for (LoggedRequest req : primary.findAll(WireMock.anyRequestedFor(WireMock.anyUrl()))) {
            assertEquals(PRIMARY_TOKEN, req.getHeader("PRIVATE-TOKEN"),
                    "Primary received a request with the wrong token: " + req.getUrl());
        }
        for (LoggedRequest req : secondary.findAll(WireMock.anyRequestedFor(WireMock.anyUrl()))) {
            assertEquals(SECONDARY_TOKEN, req.getHeader("PRIVATE-TOKEN"),
                    "Secondary received a request with the wrong token: " + req.getUrl());
        }

        // Each environment's project persisted under its own native group id and namespace.
        // Both instances share native group 500 here; the namespace_id column is what
        // keeps the two environments' data separate.
        Map<String, Object> pRow = jdbcTemplate.queryForMap(
                "SELECT group_id, namespace_id FROM analytics_projects WHERE gitlab_id = " + PRIMARY_PROJECT);
        assertEquals(GROUP_ID, ((Number) pRow.get("group_id")).longValue());
        assertEquals(0L, ((Number) pRow.get("namespace_id")).longValue());

        Map<String, Object> sRow = jdbcTemplate.queryForMap(
                "SELECT group_id, namespace_id FROM analytics_projects WHERE gitlab_id = " + SECONDARY_PROJECT);
        assertEquals(GROUP_ID, ((Number) sRow.get("group_id")).longValue());
        assertEquals(1L, ((Number) sRow.get("namespace_id")).longValue());
        assertEquals(FederatedIdUtility.decode(SECONDARY_FEDERATED_GROUP)[0],
                ((Number) sRow.get("namespace_id")).longValue(),
                "secondary project row namespace must match its federated group's namespace");

        // Each environment's pipeline + job landed (secondary included).
        assertEquals(1, rowCount("SELECT COUNT(*) FROM analytics_pipelines WHERE gitlab_id = " + SECONDARY_PROJECT * 10L));
        assertEquals(1, rowCount("SELECT COUNT(*) FROM analytics_jobs WHERE gitlab_id = " + SECONDARY_PROJECT * 100L));
        assertEquals(1, rowCount("SELECT COUNT(*) FROM analytics_pipelines WHERE gitlab_id = " + PRIMARY_PROJECT * 10L));
        assertEquals(1, rowCount("SELECT COUNT(*) FROM analytics_jobs WHERE gitlab_id = " + PRIMARY_PROJECT * 100L));

        // Runner state is keyed by the native group id. Both mock environments share
        // native group 500, so a single runner_state row keyed by GROUP_ID is expected
        // (the last environment to sync wins — the primary/secondary split is asserted
        // above via the distinct projects/pipelines/jobs per namespace).
        assertEquals(1, rowCount("SELECT COUNT(*) FROM analytics_runner_state WHERE group_id = ?",
                GROUP_ID));
        assertEquals(0, rowCount("SELECT COUNT(*) FROM analytics_runner_state WHERE group_id <> ?",
                GROUP_ID));
        assertEquals(1, rowCount("SELECT COUNT(*) FROM analytics_users WHERE gitlab_id = 7001"));
    }
}
