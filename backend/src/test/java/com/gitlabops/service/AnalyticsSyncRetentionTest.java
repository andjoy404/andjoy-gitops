package com.gitlabops.service;

import com.gitlabops.config.AnalyticsProperties;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.repository.EnvironmentRepository.EnvironmentClientConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AnalyticsSyncRetentionTest {

    private static final int RETENTION_DAYS = 30;

    private GitLabApiClient gitLabClient;
    private EnvironmentRepository mockEnvRepo;
    private AnalyticsSyncStorage syncStorage;
    private AnalyticsSyncService service;

    @BeforeEach
    void setUp() {
        gitLabClient = mock(GitLabApiClient.class);
        mockEnvRepo = mock(EnvironmentRepository.class);
        syncStorage = mock(AnalyticsSyncStorage.class);
        SyncMetrics syncMetrics = mock(SyncMetrics.class);
        AnalyticsProperties analyticsProperties = mock(AnalyticsProperties.class);
        when(analyticsProperties.getSyncIntervalSeconds()).thenReturn(60);
        when(analyticsProperties.getRetentionDays()).thenReturn(RETENTION_DAYS);
        when(analyticsProperties.isSyncUsers()).thenReturn(true);
        when(analyticsProperties.getPipelineHistoryDays()).thenReturn("30");

        EnvironmentClientConfig envCfg = new EnvironmentClientConfig(
                1L, 0, "test-env", "http://test.local", "glpat-test",
                List.<Long>of(42L), true, true);
        when(mockEnvRepo.getEnabledClients()).thenReturn(List.of(envCfg));

        service = new AnalyticsSyncService(
                gitLabClient, mockEnvRepo, syncStorage, syncMetrics, analyticsProperties);
    }

    /** markSyncCompleted MUST be called BEFORE runRetentionCleanup. */
    @Test
    void syncCompletedBeforeRetentionCleanup() throws InterruptedException {
        doAnswer(inv -> null).when(syncStorage).runRetentionCleanup(anyInt(), anyLong());
        service.syncAll(true);

        InOrder inOrder = inOrder(syncStorage);
        inOrder.verify(syncStorage).markSyncStarted();
        inOrder.verify(syncStorage).markSyncCompleted();
        inOrder.verify(syncStorage).runRetentionCleanup(eq(RETENTION_DAYS), anyLong());
    }

    /** runRetentionCleanup must receive a positive, sane sync-start timestamp. */
    @Test
    void retentionCleanupReceivesValidSyncStart() throws InterruptedException {
        final long[] captureSyncStart = new long[1];
        doAnswer(inv -> {
            captureSyncStart[0] = inv.getArgument(1);
            return null;
        }).when(syncStorage).runRetentionCleanup(anyInt(), anyLong());

        service.syncAll(true);

        long now = System.currentTimeMillis();
        assertTrue(captureSyncStart[0] > 0);
        assertTrue(captureSyncStart[0] <= now);
        assertTrue(captureSyncStart[0] >= now - 10_000);
    }

    /** Even if retention cleanup throws, markSyncCompleted already ran. */
    @Test
    void markCompletedEvenWhenRetentionFails() throws InterruptedException {
        doThrow(new RuntimeException("retention broken"))
                .when(syncStorage).runRetentionCleanup(anyInt(), anyLong());

        service.syncAll(true);
        verify(syncStorage, atLeastOnce()).markSyncCompleted();
    }

    /** The two-arity overload (retentionDays, syncStartMs) is called. */
    @Test
    void retentionCleanupHasTwoArity() throws InterruptedException {
        doAnswer(inv -> null).when(syncStorage).runRetentionCleanup(anyInt(), anyLong());
        service.syncAll(true);
        verify(syncStorage, times(1)).runRetentionCleanup(eq(RETENTION_DAYS), anyLong());
    }

    /** markSyncCompleted is always called. */
    @Test
    void syncCompletedNeverSkipped() throws InterruptedException {
        doAnswer(inv -> null).when(syncStorage).runRetentionCleanup(anyInt(), anyLong());
        service.syncAll(true);
        verify(syncStorage, times(1)).markSyncCompleted();
    }

    private void awaitIdle(AnalyticsSyncService svc, long envId, long groupId)
            throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (svc.isScopedRefreshInFlight(envId, groupId)) {
            if (System.nanoTime() > deadline) fail("scoped refresh did not finish");
            Thread.sleep(10);
        }
    }
}
