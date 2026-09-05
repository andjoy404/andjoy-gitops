package com.gitlabops.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Micrometer metrics for GitLab synchronization operations.
 *
 * <h3>Metrics registered:</h3>
 * <ul>
 *   <li>sync.total — Counter: total sync attempts</li>
 *   <li>sync.success — Counter: successful syncs</li>
 *   <li>sync.failure — Counter: failed syncs</li>
 *   <li>sync.projects — Counter: projects synced</li>
 *   <li>sync.pipelines — Counter: pipelines synced</li>
 *   <li>sync.jobs — Counter: jobs synced</li>
 *   <li>sync.duration — Timer: sync duration in milliseconds</li>
 *   <li>sync.gitlab.retry — Counter: GitLab API retry attempts (reason tag)</li>
 *   <li>sync.gitlab.error — Counter: GitLab API error responses (status tag)</li>
 * </ul>
 */
@Component
public class SyncMetrics {

    private final MeterRegistry registry;

    private final Counter syncTotal;
    private final Counter syncSuccess;
    private final Counter syncFailure;
    private final Counter syncProjects;
    private final Counter syncPipelines;
    private final Counter syncJobs;
    private final Timer syncDuration;
    private final Counter syncGitlabRetry;
    private final Counter syncGitlabError;

    public SyncMetrics(MeterRegistry registry) {
        this.registry = registry;

        syncTotal = Counter.builder("sync.total")
                .description("Total GitLab sync attempts")
                .register(registry);

        syncSuccess = Counter.builder("sync.success")
                .description("Successful GitLab sync completions")
                .register(registry);

        syncFailure = Counter.builder("sync.failure")
                .description("GitLab syncs that completed with errors")
                .register(registry);

        syncProjects = Counter.builder("sync.projects")
                .description("Total projects synced across all sync runs")
                .register(registry);

        syncPipelines = Counter.builder("sync.pipelines")
                .description("Total pipelines synced across all sync runs")
                .register(registry);

        syncJobs = Counter.builder("sync.jobs")
                .description("Total jobs synced across all sync runs")
                .register(registry);

        syncDuration = Timer.builder("sync.duration")
                .description("Duration of GitLab sync operations in milliseconds")
                .register(registry);

        syncGitlabRetry = Counter.builder("sync.gitlab.retry")
                .description("GitLab API retry attempts")
                .tag("reason", "rate_limit_or_server_error")
                .register(registry);

        syncGitlabError = Counter.builder("sync.gitlab.error")
                .description("GitLab API error responses by status class")
                .tag("status", "client_error")
                .register(registry);
    }

    public void recordSyncStart() {
        syncTotal.increment();
    }

    public void recordSyncSuccess(int projects, int pipelines, int jobs, long durationMillis) {
        syncSuccess.increment();
        syncProjects.increment(projects);
        syncPipelines.increment(pipelines);
        syncJobs.increment(jobs);
        syncDuration.record(durationMillis, TimeUnit.MILLISECONDS);
    }

    public void recordSyncFailure(long durationMillis) {
        syncFailure.increment();
        syncDuration.record(durationMillis, TimeUnit.MILLISECONDS);
    }

    public void recordGitlabRetry() {
        syncGitlabRetry.increment();
    }

    public void recordGitlabError(String statusClass) {
        registry.counter("sync.gitlab.error", "status", statusClass).increment();
    }
}
