package com.gitlabops;

import com.gitlabops.model.dto.GitlabGroup;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.service.AnalyticsSyncService;
import com.gitlabops.service.AnalyticsSyncStorage;
import com.gitlabops.service.GitLabApiClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Phase 5 integration tests for the GitLab sync engine.
 */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "spring.task.scheduling.enabled=false"
})
class GitLabSyncServiceTest {

    private static final long TEST_GROUP_ID = 99900L;

    @Autowired
    private AnalyticsSyncService syncService;

    @Autowired
    private AnalyticsSyncStorage syncStorage;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private java.time.Instant nowInstant;
    @BeforeEach
    void setUp() {
        nowInstant = java.time.Instant.now();
        jdbcTemplate.execute("DELETE FROM analytics_jobs WHERE gitlab_id >= 90400");
        jdbcTemplate.execute("DELETE FROM analytics_pipelines WHERE gitlab_id >= 90100");
        jdbcTemplate.execute("DELETE FROM analytics_projects WHERE group_id = " + TEST_GROUP_ID);
        jdbcTemplate.execute("DELETE FROM analytics_runner_state WHERE group_id = " + TEST_GROUP_ID);
        jdbcTemplate.execute("DELETE FROM analytics_pipelines WHERE gitlab_id = 99999");
    }

    // ─── Basic DTO Tests ───────────────────────────────────────

    @Test
    void pipelinePrepStatementWorks() {
        // Direct test that pipeline prepare statement works
        java.time.OffsetDateTime now = java.time.OffsetDateTime.now();
        jdbcTemplate.update(
            "INSERT INTO analytics_pipelines(gitlab_id, iid, project_id, sha, branch, " +
            "status, source, coverage, created_at, updated_at, web_url, author_id) " +
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON CONFLICT (gitlab_id) DO UPDATE SET " +
            "iid = EXCLUDED.iid, status = EXCLUDED.status, source = EXCLUDED.source",
            99990L, 1L, 90000L, "sha_test", "main", "success", "push",
            85.5, now, now, "http://test", 100L);
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM analytics_pipelines WHERE gitlab_id = 99990", Integer.class);
        assertEquals(1, count);
        jdbcTemplate.execute("DELETE FROM analytics_pipelines WHERE gitlab_id = 99990");
    }

    @Test
    void testGitlabGroupCreation() {
        GitlabGroup group = new GitlabGroup(1L, "Test Org", "test-org", null, null, null,
                0, null, null, false, 0, 0, 0, 0);
        assertNotNull(group);
        assertEquals("Test Org", group.name());
        assertEquals(1L, group.id());
    }

    @Test
    void jdbcTemplateBasicWriteWorks() {
        // Quick sanity check that DB connection works
        jdbcTemplate.execute("DELETE FROM analytics_projects WHERE gitlab_id = 99888");
        jdbcTemplate.execute(
            "INSERT INTO analytics_projects(gitlab_id, group_id, name, path, web_url, " +
            "default_branch, namespace_path, topics, jobs_enabled) " +
            "VALUES(99888, 99900, 'sanity-proj', 'sanity', 'http://test', 'main', 'test', '[]', true)");
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM analytics_projects WHERE gitlab_id = 99888", Integer.class);
        assertEquals(1, count, "Basic JDBC insert should work");
        jdbcTemplate.execute("DELETE FROM analytics_projects WHERE gitlab_id = 99888");
    }

    // ─── Project Sync Tests ────────────────────────────────────

    @Test
    void upsertProjectsIsIdempotent() {
        List<Map<String, Object>> projects = List.of(
            makeProject(90001L, "proj-a", List.of("a")),
            makeProject(90002L, "proj-b", List.of("b")),
            makeProject(90003L, "proj-c", List.of("c"))
        );

        // First sync
        int firstSync = syncStorage.upsertProjects(projects, TEST_GROUP_ID, 0L);
        assertEquals(3, firstSync);
        assertProjectCount(3);

        // Second sync with same data (idempotency)
        int secondSync = syncStorage.upsertProjects(projects, TEST_GROUP_ID, 0L);
        assertEquals(3, secondSync);
        assertProjectCount(3);
    }

    @Test
    void upsertProjectsUpdatesExisting() {
        // Insert project
        syncStorage.upsertProjects(List.of(makeProject(90010L, "updated-proj", List.of("v1"))),
                TEST_GROUP_ID, 0L);

        String topics1 = jdbcTemplate.queryForObject(
                "SELECT topics FROM analytics_projects WHERE gitlab_id = 90010", String.class);
        assertEquals("[\"v1\"]", topics1);

        // Update project
        syncStorage.upsertProjects(List.of(makeProject(90010L, "updated-proj", List.of("v2", "v3"))),
                TEST_GROUP_ID, 0L);

        String topics2 = jdbcTemplate.queryForObject(
                "SELECT topics FROM analytics_projects WHERE gitlab_id = 90010", String.class);
        assertEquals("[\"v2\", \"v3\"]", topics2);
    }

    private Map<String, Object> makeProject(long id, String name, List<String> topics) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", id);
        p.put("name", name);
        p.put("path", name);
        p.put("web_url", "https://gitlab.com/test/" + name);
        p.put("default_branch", "main");
        p.put("jobs_enabled", true);
        p.put("topics", topics);
        Map<String, Object> ns = new LinkedHashMap<>();
        ns.put("id", 1L);
        ns.put("full_path", "test");
        ns.put("parent_id", 0);
        p.put("namespace", ns);
        return p;
    }

    private void assertProjectCount(int expected) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_projects WHERE group_id = ?",
                Integer.class, TEST_GROUP_ID);
        assertEquals(expected, count);
    }

    // ─── Pipeline Sync Tests ───────────────────────────────────

    @Test
    void upsertPipelinesIsIdempotent() {
        List<Map<String, Object>> pipelines = makePipelines(90101L, 90102L, 90103L);

        int firstSync = syncStorage.upsertPipelines(pipelines, 90000L);
        assertEquals(3, firstSync);
        assertPipelineCount(3);

        // Idempotent second sync
        int secondSync = syncStorage.upsertPipelines(pipelines, 90000L);
        assertEquals(3, secondSync);
        assertPipelineCount(3);
    }

    @Test
    void pipelineStatusUpdateOverwrites() {
        // First sync: pipeline is 'success'
        List<Map<String, Object>> pipelines1 = List.of(
            makePipeline(90201L, 90000L, "main", "success", "push", "abc123")
        );
        syncStorage.upsertPipelines(pipelines1, 90000L);

        String status1 = jdbcTemplate.queryForObject(
                "SELECT status FROM analytics_pipelines WHERE gitlab_id = 90201", String.class);
        assertEquals("success", status1);

        // Second sync: pipeline status changed to 'failed'
        List<Map<String, Object>> pipelines2 = List.of(
            makePipeline(90201L, 90000L, "main", "failed", "push", "def456")
        );
        syncStorage.upsertPipelines(pipelines2, 90000L);

        String status2 = jdbcTemplate.queryForObject(
                "SELECT status FROM analytics_pipelines WHERE gitlab_id = 90201", String.class);
        assertEquals("failed", status2);

        String sha2 = jdbcTemplate.queryForObject(
                "SELECT sha FROM analytics_pipelines WHERE gitlab_id = 90201", String.class);
        assertEquals("def456", sha2);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> makePipelines(long... ids) {
        String now = java.time.Instant.now().toString();
        List<Map<String, Object>> list = new ArrayList<>();
        for (long id : ids) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("id", id); p.put("iid", 1L); p.put("project_id", 90000L);
            p.put("ref", "main"); p.put("sha", "sha" + id); p.put("status", "success");
            p.put("source", "push"); p.put("coverage", 85.5);
            p.put("created_at", now); p.put("updated_at", now);
            p.put("web_url", "https://gitlab.com/pipelines/" + id); p.put("author_id", 100L);
            list.add(p);
        }
        return list;
    }

    private Map<String, Object> makePipeline(long gitlabId, long projectId, String branch,
                                              String status, String source, String sha) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", gitlabId); p.put("iid", 1L); p.put("project_id", projectId);
        p.put("ref", branch); p.put("sha", sha); p.put("status", status);
        p.put("source", source); p.put("coverage", 85.5);
        String now = java.time.Instant.now().toString();
        p.put("created_at", now); p.put("updated_at", now);
        p.put("web_url", "https://gitlab.com/pipelines/" + gitlabId);
        p.put("author_id", 100L);
        return p;
    }

    private void assertPipelineCount(int expected) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE project_id = 90000 AND gitlab_id > 90000",
                Integer.class);
        assertEquals(expected, count);
    }

    // ─── Job Sync Tests ────────────────────────────────────────

    @Test
    void upsertJobsIsIdempotent() {
        long pipelineId = 90301L;
        // Ensure pipeline and project exist (jobs have FKs to both)
        syncStorage.upsertProjects(List.of(makeProject(90000L, "test-proj", new ArrayList<>())),
                TEST_GROUP_ID, 0L);
        syncStorage.upsertPipelines(List.of(makePipeline(pipelineId, 90000L, "main", "success",
                "push", "abc123")), 90000L);

        List<Map<String, Object>> jobs = makeJobs(pipelineId);

        int firstSync = syncStorage.upsertJobs(jobs, pipelineId, 90000L, 100L);
        assertEquals(3, firstSync);
        assertJobCount(pipelineId, 3);

        int secondSync = syncStorage.upsertJobs(jobs, pipelineId, 90000L, 100L);
        assertEquals(3, secondSync);
        assertJobCount(pipelineId, 3);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> makeJobs(long pipelineId) {
        String now = java.time.Instant.now().toString();
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(makeJob(90401L, pipelineId, 90000L, "build", "build", "main", "success", false, now));
        list.add(makeJob(90402L, pipelineId, 90000L, "test", "test", "main", "success", false, now));
        list.add(makeJob(90403L, pipelineId, 90000L, "deploy", "deploy", "main", "success", true, now));
        return list;
    }

    private Map<String, Object> makeJob(long id, long pipelineId, long projectId,
                                         String name, String stage, String ref,
                                         String status, boolean allowFailure, String createdAt) {
        Map<String, Object> j = new LinkedHashMap<>();
        j.put("id", id); j.put("project_id", projectId); j.put("name", name);
        j.put("stage", stage); j.put("status", status); j.put("ref", ref);
        j.put("allow_failure", allowFailure); j.put("created_at", createdAt);
        j.put("web_url", "https://gitlab.com/jobs/" + id);
        return j;
    }

    private void assertJobCount(long pipelineId, int expected) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_jobs WHERE pipeline_id = ? AND gitlab_id > 90000",
                Integer.class, pipelineId);
        assertEquals(expected, count);
    }

    // ─── Pagination Tests ──────────────────────────────────────

    @Test
    void paginationReturnsAllItems() {
        List<Map<String, Object>> allItems = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            Map<String, Object> item = makeProject(91000L + i, "proj-" + i, new ArrayList<>());
            allItems.add(item);
        }

        int synced = syncStorage.upsertProjects(allItems, TEST_GROUP_ID, 0L);
        assertEquals(50, synced);

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_projects WHERE group_id = ? AND gitlab_id >= 91000",
                Integer.class, TEST_GROUP_ID);
        assertEquals(50, count);
    }

    // ─── Runners ───────────────────────────────────────────────

    @Test
    void runnerStateUpsert() {
        Map<String, Object> payload = new LinkedHashMap<>();
        Map<String, Object> runner1 = new LinkedHashMap<>();
        runner1.put("id", 1L);
        runner1.put("description", "test-runner");
        runner1.put("status", "online");
        runner1.put("online", true);
        runner1.put("job_execution_status", "running");
        runner1.put("paused", false);
        payload.put("payload", List.of(runner1));

        syncStorage.upsertRunnerState(TEST_GROUP_ID, payload);

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_runner_state WHERE group_id = ?",
                Integer.class, TEST_GROUP_ID);
        assertEquals(1, count);
    }

    // ─── Sync State Management ─────────────────────────────────

    @Test
    void syncStateTrackingWorks() {
        assertFalse(syncStorage.isSyncRunning());
        syncStorage.markSyncStarted();
        assertTrue(syncStorage.isSyncRunning());
        syncStorage.markSyncCompleted();
        assertFalse(syncStorage.isSyncRunning());
    }

    @Test
    void syncStateStatusReturnsCorrectValue() {
        syncStorage.markSyncCompleted();
        assertEquals("idle", syncStorage.getSyncStatus());
        syncStorage.markSyncStarted();
        assertEquals("syncing", syncStorage.getSyncStatus());
        syncStorage.markSyncCompleted();
        assertEquals("idle", syncStorage.getSyncStatus());
    }

    // ─── Exception Tests ───────────────────────────────────────

    @Test
    void gitlabApiExceptionContainsMessage() {
        try {
            throw new GitLabApiClient.GitLabApiException("Rate limited on /groups");
        } catch (GitLabApiClient.GitLabApiException e) {
            assertNotNull(e.getMessage());
            assertTrue(e.getMessage().contains("Rate limited"));
        }
    }

    // ─── Retention Cleanup ─────────────────────────────────────

    @Test
    void retentionCleanupRemovesOldPipelines() {
        jdbcTemplate.execute(
            "INSERT INTO analytics_pipelines(gitlab_id, iid, project_id, sha, branch, " +
            "status, source, coverage, created_at, updated_at, web_url, collected_at) " +
            "VALUES(99999, 1, 101, 'old', 'main', 'success', 'push', 85.5, " +
            "NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 days', " +
            "'http://old', NOW() - INTERVAL '35 days')");

        Integer before = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE gitlab_id = 99999", Integer.class);
        assertEquals(1, before);

        syncStorage.runRetentionCleanup(30);

        Integer after = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM analytics_pipelines WHERE gitlab_id = 99999", Integer.class);
        assertEquals(0, after);
    }

    // ─── Empty Input Handling ──────────────────────────────────

    @Test
    void upsertProjectsHandlesEmptyList() {
        int count = syncStorage.upsertProjects(Collections.emptyList(), 123L, 0L);
        assertEquals(0, count);
    }

    @Test
    void upsertPipelinesHandlesNullInput() {
        int count = syncStorage.upsertPipelines(null, 101L);
        assertEquals(0, count);
    }

    @Test
    void upsertJobsHandlesEmptyList() {
        int count = syncStorage.upsertJobs(Collections.emptyList(), 1001L, 101L, 100L);
        assertEquals(0, count);
    }
}
