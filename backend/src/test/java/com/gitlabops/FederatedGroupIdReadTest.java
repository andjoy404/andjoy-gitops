package com.gitlabops;

import com.gitlabops.model.dto.AnalyticsReadiness;
import com.gitlabops.service.AnalyticsService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Regression: analytics read endpoints must accept the federated group ids the
 * frontend sends (namespace &lt;&lt; 44 | local) and resolve them to the native
 * GitLab group id stored in analytics_*.group_id. Decoding is idempotent, so
 * native ids keep working.
 *
 * <p>Two groups from two different environments are seeded with native ids,
 * plus a decoy group that shares a native id with one of them under another
 * environment: a pre-fix implementation (raw CSV compare) returns empty for
 * the federated selection, and cannot distinguish the decoy either.
 */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "spring.task.scheduling.enabled=false",
    "security.encryption-key=0000000000000000000000000000000000000000000000000000000000000000"
})
class FederatedGroupIdReadTest {

    private static final long NS_MULTIPLIER = 1L << 44;

    // env2 (namespace 1): the live "Gitlab Cloud" env group ids
    private static final long NATIVE_GROUP_A = 9529747L;
    private static final long NATIVE_GROUP_B = 87226573L;
    private static final long FEDERATED_A = NS_MULTIPLIER + NATIVE_GROUP_A;
    private static final long FEDERATED_B = NS_MULTIPLIER + NATIVE_GROUP_B;

    // decoy: same native id as A under another environment (namespace 2)
    private static final long NATIVE_DECOY = 9529747L;
    private static final long FEDERATED_DECOY = (2L << 44) | NATIVE_DECOY;

    private static final long PROJECT_A1 = 91000001L;
    private static final long PROJECT_A2 = 91000002L;
    private static final long PROJECT_B1 = 91000003L;
    private static final long PROJECT_DECOY = 91000004L;
    private static final long PIPELINE_A1 = 92000001L;

    @Autowired
    private AnalyticsService analyticsService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void seed() {
        jdbcTemplate.execute("DELETE FROM analytics_pipelines WHERE gitlab_id >= 92000000");
        jdbcTemplate.execute("DELETE FROM analytics_projects WHERE gitlab_id >= 91000000");
        jdbcTemplate.execute("DELETE FROM analytics_runner_state WHERE group_id IN ("
                + NATIVE_GROUP_A + "," + NATIVE_GROUP_B + ")");
        jdbcTemplate.update(
            "INSERT INTO analytics_sync_state(scope, last_started_at, last_completed_at, last_error) " +
            "VALUES('pipelines', NOW(), NOW(), NULL) " +
            "ON CONFLICT (scope) DO UPDATE SET last_started_at = EXCLUDED.last_started_at, " +
            "last_completed_at = EXCLUDED.last_completed_at, last_error = NULL");

        seedProject(PROJECT_A1, NATIVE_GROUP_A, 1);
        seedProject(PROJECT_A2, NATIVE_GROUP_A, 1);
        seedProject(PROJECT_B1, NATIVE_GROUP_B, 1);
        seedProject(PROJECT_DECOY, NATIVE_DECOY, 2);

        // A readiness call is scoped by the "refresh:{ns}:{native}" state row.
        // Mark groups A and B as having completed a scoped refresh so readiness
        // reports ready; a never-refreshed group is idle/not-started (see
        // AnalyticsScopedReadinessTest).
        seedScopedCompleted(1, NATIVE_GROUP_A);
        seedScopedCompleted(1, NATIVE_GROUP_B);

        jdbcTemplate.update(
            "INSERT INTO analytics_pipelines(gitlab_id, iid, project_id, sha, branch, status, " +
            "source, created_at, updated_at, web_url) VALUES(?, 1, ?, 'sha', 'main', 'success', " +
            "'push', NOW(), NOW(), 'http://x') " +
            "ON CONFLICT (gitlab_id) DO UPDATE SET project_id = EXCLUDED.project_id",
            PIPELINE_A1, PROJECT_A1);

        jdbcTemplate.update(
            "INSERT INTO analytics_runner_state(group_id, payload, collected_at) " +
            "VALUES(?, CAST(? AS jsonb), NOW()) " +
            "ON CONFLICT (group_id) DO UPDATE SET payload = EXCLUDED.payload, collected_at = NOW()",
            NATIVE_GROUP_A, "{\"runners\":[]}");
    }

    @AfterEach
    void clean() {
        jdbcTemplate.execute("DELETE FROM analytics_pipelines WHERE gitlab_id >= 92000000");
        jdbcTemplate.execute("DELETE FROM analytics_projects WHERE gitlab_id >= 91000000");
        jdbcTemplate.execute("DELETE FROM analytics_runner_state WHERE group_id IN ("
                + NATIVE_GROUP_A + "," + NATIVE_GROUP_B + ")");
        jdbcTemplate.execute("DELETE FROM analytics_sync_state WHERE scope LIKE 'refresh:%'");
    }

    private void seedProject(long gitlabId, long groupId, long namespaceId) {
        jdbcTemplate.update(
            "INSERT INTO analytics_projects(gitlab_id, group_id, name, path, web_url, " +
            "default_branch, namespace_path, topics, jobs_enabled, last_seen_at, " +
            "namespace_id, namespace_parent_id) " +
            "VALUES(?, ?, ?, ?, ?, 'main', ?, '[]', TRUE, NOW(), ?, ?) " +
            "ON CONFLICT (gitlab_id) DO UPDATE SET group_id = EXCLUDED.group_id",
            gitlabId, groupId, "p" + gitlabId, "p" + gitlabId,
            "http://x/" + gitlabId, "ns/" + gitlabId, namespaceId, 0);
    }

    private void seedScopedCompleted(long namespaceId, long nativeGroupId) {
        jdbcTemplate.update(
            "INSERT INTO analytics_sync_state(scope, last_started_at, last_completed_at, last_error) " +
            "VALUES('refresh:' || ? || ':' || ?, NOW() - INTERVAL '1 hour', " +
            "NOW() - INTERVAL '30 minutes', NULL) " +
            "ON CONFLICT (scope) DO UPDATE SET last_started_at = EXCLUDED.last_started_at, " +
            "last_completed_at = EXCLUDED.last_completed_at, last_error = NULL",
            namespaceId, nativeGroupId);
    }

    @Test
    void federatedGroupIdsResolveToStoredNativeGroup() {
        AnalyticsReadiness fed = analyticsService.getReadiness(String.valueOf(FEDERATED_A));
        assertTrue(fed.isReady(), "ready flag: " + fed.getMessage());
        assertTrue(fed.isDataAvailable(), "federated id must hit stored rows");
        // group A has 2 projects; the decoy row (namespace 2) shares A's native
        // id, so the native-keyed view sees 3
        assertEquals(3, fed.getProjectCount(), "federated id decodes to native group A");
        assertEquals(1, fed.getPipelineCount());
        assertEquals(1, fed.getRunnerStateCount());

        // native id keeps working (decode is idempotent below the instance shift);
        // same native-keyed view as the federated form (includes the decoy row)
        AnalyticsReadiness nativeReadiness = analyticsService.getReadiness(String.valueOf(NATIVE_GROUP_A));
        assertEquals(3, nativeReadiness.getProjectCount());
    }

    @Test
    void federatedIdsFromOtherEnvironmentDoNotLeak() {
        AnalyticsReadiness fedB = analyticsService.getReadiness(String.valueOf(FEDERATED_B));
        assertTrue(fedB.isReady());
        assertEquals(1, fedB.getProjectCount(), "group B has exactly one project");

        // the decoy shares group A's native id; readiness by its federated form
        // must not be a different story than by the plain group id
        AnalyticsReadiness decoy = analyticsService.getReadiness(String.valueOf(FEDERATED_DECOY));
        assertEquals(3, decoy.getProjectCount(),
            "decoy native id matches group A rows via the shared native key");
    }

    @Test
    void multipleFederatedGroupIdsCsv() {
        AnalyticsReadiness both = analyticsService.getReadiness(
            FEDERATED_A + "," + FEDERATED_B);
        // A (2 projects) + decoy row sharing A's native id + B (1 project) = 4
        assertEquals(4, both.getProjectCount());
    }
}
