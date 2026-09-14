package com.gitlabops.service;

import com.gitlabops.config.AnalyticsProperties;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.util.FederatedIdUtility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for the scoped refresh entry point ({@code refreshScope}):
 * federated/native id boundaries, environment/group namespace validation,
 * native-id-only routing to GitLab, in-flight dedup, and error persistence.
 *
 * <p>No Spring context or HTTP: the GitLab client and storage are mocks, so the
 * tests pin down exactly which ids cross the service boundary.</p>
 */
class AnalyticsSyncServiceTest {

    private static final long ENV_ID_NS1 = 7L;
    private static final long ENV_ID_NS0 = 3L;
    private static final long NATIVE_GROUP = 500L;
    private static final long FEDERATED_NS1 = FederatedIdUtility.encode(1, NATIVE_GROUP);
    private static final long FEDERATED_NS2 = FederatedIdUtility.encode(2, NATIVE_GROUP);

    private GitLabApiClient gitLabClient;
    private AnalyticsSyncStorage syncStorage;
    private AnalyticsSyncService service;

    @BeforeEach
    void setUp() {
        gitLabClient = mock(GitLabApiClient.class);
        EnvironmentRepository environmentRepository = mock(EnvironmentRepository.class);
        syncStorage = mock(AnalyticsSyncStorage.class);
        SyncMetrics syncMetrics = mock(SyncMetrics.class);
        AnalyticsProperties analyticsProperties = mock(AnalyticsProperties.class);
        when(analyticsProperties.getSyncIntervalSeconds()).thenReturn(60);
        when(analyticsProperties.getRetentionDays()).thenReturn(30);
        when(analyticsProperties.isSyncUsers()).thenReturn(true);
        when(analyticsProperties.getPipelineHistoryDays()).thenReturn("30");
        service = new AnalyticsSyncService(
                gitLabClient, environmentRepository, syncStorage, syncMetrics,
                analyticsProperties);
        when(gitLabClient.namespaceForEnvironmentId(ENV_ID_NS1)).thenReturn(1L);
        when(gitLabClient.namespaceForEnvironmentId(ENV_ID_NS0)).thenReturn(0L);
        when(gitLabClient.namespaceForEnvironmentId(999L)).thenThrow(
                new IllegalArgumentException("Unknown or disabled GitLab environment: 999"));
        when(gitLabClient.getAllProjectsForGroup(anyLong(), anyBoolean(), anyLong()))
                .thenReturn(List.of());
    }

    private static void awaitIdle(AnalyticsSyncService service, long envId, long groupId)
            throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (service.isScopedRefreshInFlight(envId, groupId)) {
            if (System.nanoTime() > deadline) fail("scoped refresh did not finish in time");
            Thread.sleep(10);
        }
    }

    @Test
    void rejectsUnknownEnvironment() {
        String outcome = service.refreshScope(999L, FEDERATED_NS1);
        assertTrue(outcome.startsWith("rejected:"), outcome);
        // Only the namespace lookup may touch the client; no fetch may start.
        verify(gitLabClient, times(1)).namespaceForEnvironmentId(999L);
        verify(gitLabClient, never()).getAllProjectsForGroup(anyLong(), anyBoolean(), anyLong());
        verifyNoInteractions(syncStorage);
    }

    @Test
    void rejectsFederatedGroupFromDifferentNamespace() {
        // Group's high bits say namespace 2; the selected environment owns namespace 1.
        String outcome = service.refreshScope(ENV_ID_NS1, FEDERATED_NS2);
        assertEquals("rejected:group does not belong to the selected environment", outcome);
        verify(gitLabClient, never()).getAllProjectsForGroup(anyLong(), anyBoolean(), anyLong());
        verifyNoInteractions(syncStorage);
    }

    @Test
    void rejectsBareNativeIdWhenSelectedEnvironmentHasNonZeroNamespace() {
        // A bare native id (no namespace bits) must not be accepted for an
        // environment whose namespace is non-zero: it cannot be mapped to a
        // single environment without ambiguity.
        String outcome = service.refreshScope(ENV_ID_NS1, NATIVE_GROUP);
        assertEquals("rejected:group does not belong to the selected environment", outcome);
        verify(gitLabClient, never()).getAllProjectsForGroup(anyLong(), anyBoolean(), anyLong());
        verifyNoInteractions(syncStorage);
    }

    @Test
    void acceptsFederatedGroupAndRoutesNativeIdToGitLab() throws Exception {
        String outcome = service.refreshScope(ENV_ID_NS1, FEDERATED_NS1);
        assertEquals("accepted", outcome);
        awaitIdle(service, ENV_ID_NS1, FEDERATED_NS1);

        // GitLab must receive the native id and the environment's namespace —
        // never the federated encoding.
        verify(gitLabClient).getAllProjectsForGroup(eq(NATIVE_GROUP), eq(true), eq(1L));
        InOrder inOrder = inOrder(syncStorage);
        inOrder.verify(syncStorage).markSyncStarted(eq("refresh:1:500"));
        inOrder.verify(syncStorage).markSyncCompleted(eq("refresh:1:500"), isNull());
        assertFalse(service.isScopedRefreshInFlight(ENV_ID_NS1, FEDERATED_NS1));
    }

    @Test
    void acceptsBareNativeIdForZeroNamespaceEnvironment() throws Exception {
        // Namespace 0 encodes as the bare native id, so it is only valid for
        // the zero-namespace environment.
        String outcome = service.refreshScope(ENV_ID_NS0, NATIVE_GROUP);
        assertEquals("accepted", outcome);
        awaitIdle(service, ENV_ID_NS0, NATIVE_GROUP);

        verify(gitLabClient).getAllProjectsForGroup(eq(NATIVE_GROUP), eq(true), eq(0L));
        verify(syncStorage).markSyncCompleted(eq("refresh:0:500"), isNull());
    }

    @Test
    void rejectsSecondRefreshWhileOneIsInFlight() throws Exception {
        CountDownLatch fetchStarted = new CountDownLatch(1);
        CountDownLatch fetchDone = new CountDownLatch(1);
        when(gitLabClient.getAllProjectsForGroup(eq(NATIVE_GROUP), eq(true), eq(1L)))
                .thenAnswer(invocation -> {
                    fetchStarted.countDown();
                    assertTrue(fetchDone.await(5, TimeUnit.SECONDS),
                            "test did not release the blocked group fetch");
                    return List.of();
                });

        assertEquals("accepted", service.refreshScope(ENV_ID_NS1, FEDERATED_NS1));
        assertTrue(fetchStarted.await(5, TimeUnit.SECONDS), "group fetch never started");

        // While the first refresh is blocked mid-fetch, a repeat click for the
        // same env+group must be rejected without starting a second fetch.
        assertTrue(service.isScopedRefreshInFlight(ENV_ID_NS1, FEDERATED_NS1));
        String outcome = service.refreshScope(ENV_ID_NS1, FEDERATED_NS1);
        assertEquals("rejected:a refresh for this group is already in progress", outcome);

        fetchDone.countDown();
        awaitIdle(service, ENV_ID_NS1, FEDERATED_NS1);
        verify(gitLabClient, times(1)).getAllProjectsForGroup(NATIVE_GROUP, true, 1L);
        verify(syncStorage, times(1)).markSyncStarted(eq("refresh:1:500"));
    }

    @Test
    void persistsErrorWhenGroupFetchFails() throws Exception {
        when(gitLabClient.getAllProjectsForGroup(eq(NATIVE_GROUP), eq(true), eq(1L)))
                .thenThrow(new RuntimeException("boom " + "PRIVATE-TOKEN: " + "abcdef1234"));

        String outcome = service.refreshScope(ENV_ID_NS1, FEDERATED_NS1);
        assertEquals("accepted", outcome);
        awaitIdle(service, ENV_ID_NS1, FEDERATED_NS1);

        InOrder inOrder = inOrder(syncStorage);
        inOrder.verify(syncStorage).markSyncStarted(eq("refresh:1:500"));
        // A failed run must be recorded as completed-with-error so readiness
        // surfaces the failure instead of a clean completed sync, and the
        // exception message must not leak the token.
        inOrder.verify(syncStorage).markSyncCompleted(eq("refresh:1:500"), argThat(
                msg -> msg != null && msg.contains("[REDACTED]")
                        && msg.contains("boom") && !msg.contains("abcdef1234")));
    }

    @Test
    void emptyGroupCompletionIsClean() throws Exception {
        // A group with no projects is a legitimate success: completion is
        // recorded with no error and the in-flight flag clears.
        String outcome = service.refreshScope(ENV_ID_NS1, FEDERATED_NS1);
        assertEquals("accepted", outcome);
        awaitIdle(service, ENV_ID_NS1, FEDERATED_NS1);
        verify(syncStorage).markSyncCompleted(eq("refresh:1:500"), isNull());
    }

    @Test
    void skipsJobFetchForAlreadySettledPipelines() throws Exception {
        long projectId = 101L;
        java.util.Map<String, Object> project = java.util.Map.of(
                "id", projectId,
                "default_branch", "main",
                "jobs_enabled", true
        );
        when(gitLabClient.getAllProjectsForGroup(eq(NATIVE_GROUP), eq(true), eq(1L)))
                .thenReturn(List.of(project));

        // DB already contains settled jobs for pipeline 1001
        when(syncStorage.getSettledPipelineIds(projectId)).thenReturn(java.util.Set.of(1001L));

        java.util.Map<String, Object> settledPipeline = java.util.Map.of(
                "id", 1001L,
                "status", "success"
        );
        java.util.Map<String, Object> runningPipeline = java.util.Map.of(
                "id", 1002L,
                "status", "running"
        );
        java.util.Map<String, Object> newCompletedPipeline = java.util.Map.of(
                "id", 1003L,
                "status", "success"
        );

        when(gitLabClient.getPipelinesForProject(eq(projectId), anyString(), eq(1L)))
                .thenReturn(List.of(settledPipeline, runningPipeline, newCompletedPipeline));

        String outcome = service.refreshScope(ENV_ID_NS1, FEDERATED_NS1);
        assertEquals("accepted", outcome);
        awaitIdle(service, ENV_ID_NS1, FEDERATED_NS1);

        // Pipeline 1001 was already settled in DB -> must NOT fetch jobs
        verify(gitLabClient, never()).getJobsForPipeline(eq(projectId), eq(1001L), anyLong());

        // Pipeline 1002 is active ("running") -> MUST fetch jobs
        verify(gitLabClient, times(1)).getJobsForPipeline(eq(projectId), eq(1002L), eq(1L));

        // Pipeline 1003 was not in settled set (new) -> MUST fetch jobs
        verify(gitLabClient, times(1)).getJobsForPipeline(eq(projectId), eq(1003L), eq(1L));
    }

    @Test
    void syncActivePipelinesUpdatesCompletedPipelineAndFetchesJobs() {
        long projectId = 101L;
        long pipelineId = 2001L;
        var activeRef = new AnalyticsSyncStorage.ActivePipelineRef(pipelineId, projectId, "running");
        when(syncStorage.getActivePipelines(NATIVE_GROUP)).thenReturn(List.of(activeRef));

        java.util.Map<String, Object> finishedPipeline = java.util.Map.of(
                "id", pipelineId,
                "project_id", projectId,
                "status", "success"
        );
        when(gitLabClient.getPipeline(projectId, pipelineId, 1L)).thenReturn(finishedPipeline);
        when(gitLabClient.getJobsForPipeline(projectId, pipelineId, 1L)).thenReturn(List.of(
                java.util.Map.of("id", 3001L, "status", "success")
        ));

        int updated = service.syncActivePipelines(NATIVE_GROUP, 1L);
        assertEquals(1, updated);

        verify(syncStorage).upsertPipelines(List.of(finishedPipeline), projectId);
        verify(syncStorage).upsertJobs(anyList(), eq(pipelineId), eq(projectId), anyLong(), any());
    }
}
