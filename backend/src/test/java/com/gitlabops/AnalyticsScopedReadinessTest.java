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

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Readiness semantics for a single-group (scoped) call, keyed by the scoped
 * refresh state row {@code refresh:{ns}:{native}} rather than the global
 * "pipelines" row. Covers the five cases the page polls for:
 *
 * <ul>
 *   <li>no scoped state row &rarr; idle / not-started, never inherits the
 *       global pipeline state (even a running global);</li>
 *   <li>fresh start, no completion &rarr; running;</li>
 *   <li>stale start (older than the 15-minute bound), no completion &rarr;
 *       settles to idle, never spins the caller forever;</li>
 *   <li>completed &rarr; ready, no error;</li>
 *   <li>failed &rarr; ready (settled) with a sanitized scoped error.</li>
 * </ul>
 *
 * <p>The group is deliberately a clean id with no analytics data, so the
 * {@code ready} flag reflects only sync-state derivation, not data presence.</p>
 */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "analytics.enabled=true",
    "spring.task.scheduling.enabled=false",
    "security.encryption-key=0000000000000000000000000000000000000000000000000000000000000000"
})
class AnalyticsScopedReadinessTest {

    private static final long NATIVE_GROUP = 42L;
    private static final long FEDERATED = (1L << 44) | NATIVE_GROUP;
    private static final String SCOPE = "refresh:1:" + NATIVE_GROUP;

    @Autowired
    private AnalyticsService analyticsService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        clearScoped();
        resetPipelinesCompleted();
    }

    @AfterEach
    void tearDown() {
        clearScoped();
        resetPipelinesCompleted();
    }

    private void clearScoped() {
        jdbcTemplate.update("DELETE FROM analytics_sync_state WHERE scope = ?", SCOPE);
    }

    private void resetPipelinesCompleted() {
        jdbcTemplate.update(
            "INSERT INTO analytics_sync_state(scope, last_started_at, last_completed_at, last_error) "
            + "VALUES('pipelines', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', NULL) "
            + "ON CONFLICT (scope) DO UPDATE SET last_started_at = EXCLUDED.last_started_at, "
            + "last_completed_at = EXCLUDED.last_completed_at, last_error = EXCLUDED.last_error");
    }

    private void setPipelinesRunning() {
        jdbcTemplate.update(
            "INSERT INTO analytics_sync_state(scope, last_started_at, last_completed_at, last_error) "
            + "VALUES('pipelines', NOW() - INTERVAL '1 minute', NULL, NULL) "
            + "ON CONFLICT (scope) DO UPDATE SET last_started_at = EXCLUDED.last_started_at, "
            + "last_completed_at = EXCLUDED.last_completed_at, last_error = EXCLUDED.last_error");
    }

    private void seedScoped(Instant started, Instant completed, String error) {
        jdbcTemplate.update(
            "INSERT INTO analytics_sync_state(scope, last_started_at, last_completed_at, last_error) "
            + "VALUES(?, ?, ?, ?) "
            + "ON CONFLICT (scope) DO UPDATE SET last_started_at = EXCLUDED.last_started_at, "
            + "last_completed_at = EXCLUDED.last_completed_at, last_error = EXCLUDED.last_error",
            SCOPE,
            started == null ? null : Timestamp.from(started),
            completed == null ? null : Timestamp.from(completed),
            error);
    }

    @Test
    void noScopedStateRowIsIdleAndDoesNotInheritGlobalPipelineState() {
        // The scheduled full sync is running right now; a single-group page for a
        // never-refreshed group must still report idle, not "syncing".
        setPipelinesRunning();
        clearScoped();

        AnalyticsReadiness r = analyticsService.getReadiness(String.valueOf(FEDERATED));

        assertFalse(r.isReady(), "never-refreshed scoped group is not started: " + r.getMessage());
        assertEquals(Boolean.FALSE, r.getScopedSyncing(),
            "must not inherit the running global pipelines row");
        assertNull(r.getScopedError());
        assertTrue(r.getMessage() == null || r.getMessage().isBlank(),
            "idle has no spinner message, was: " + r.getMessage());
    }

    @Test
    void freshScopedStartWithoutCompletionReportsRunning() {
        seedScoped(Instant.now().minus(2, ChronoUnit.MINUTES), null, null);

        AnalyticsReadiness r = analyticsService.getReadiness(String.valueOf(FEDERATED));

        assertFalse(r.isReady());
        assertEquals(Boolean.TRUE, r.getScopedSyncing(), "fresh scoped run is running");
        assertNull(r.getScopedError());
        assertTrue(r.getMessage() != null && r.getMessage().contains("collected"),
            "running message expected, was: " + r.getMessage());
    }

    @Test
    void staleScopedRunWithNoCompletionSettlesIdle() {
        // Abandoned run: start older than the 15-minute stale bound, no completion.
        seedScoped(Instant.now().minus(30, ChronoUnit.MINUTES), null, null);

        AnalyticsReadiness r = analyticsService.getReadiness(String.valueOf(FEDERATED));

        assertFalse(r.isReady());
        assertEquals(Boolean.FALSE, r.getScopedSyncing(),
            "stale run must settle to idle, not spin forever");
        assertNull(r.getScopedError());
    }

    @Test
    void completedScopedRunIsReadyWithNoError() {
        seedScoped(Instant.now().minus(2, ChronoUnit.HOURS),
                   Instant.now().minus(1, ChronoUnit.HOURS), null);

        AnalyticsReadiness r = analyticsService.getReadiness(String.valueOf(FEDERATED));

        assertTrue(r.isReady(), "completed scoped run should be ready: " + r.getMessage());
        assertEquals(Boolean.FALSE, r.getScopedSyncing());
        assertNull(r.getScopedError());
        assertNotNull(r.getLastCompletedAt());
    }

    @Test
    void failedScopedRunIsSettledWithSanitizedError() {
        seedScoped(Instant.now().minus(2, ChronoUnit.HOURS),
                   Instant.now().minus(1, ChronoUnit.HOURS),
                   "boom PRIVATE-TOKEN: abc1234");

        AnalyticsReadiness r = analyticsService.getReadiness(String.valueOf(FEDERATED));

        assertTrue(r.isReady(), "a settled failed run is ready (spinner stops)");
        assertEquals(Boolean.FALSE, r.getScopedSyncing());
        assertNotNull(r.getScopedError(), "scoped failure must surface an error");
        assertTrue(r.getScopedError().contains("boom"), "sanitized error lost detail: " + r.getScopedError());
        assertFalse(r.getScopedError().contains("abc1234"), "secret leaked: " + r.getScopedError());
        assertTrue(r.getMessage() != null && r.getMessage().contains("issues"),
            "scoped failure message expected, was: " + r.getMessage());
    }
}
