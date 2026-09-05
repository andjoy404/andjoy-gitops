package com.gitlabops.service;

import com.gitlabops.config.AnalyticsProperties;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.repository.EnvironmentRepository.EnvironmentClientConfig;
import com.gitlabops.util.FederatedIdUtility;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Orchestrates GitLab synchronization: groups -> projects -> pipelines -> jobs.
 *
 * <p>Sync order (per environment):
 * <ol>
 *   <li>Mark sync started</li>
 *   <li>Fetch groups</li>
 *   <li>For each group: fetch projects, pipelines, jobs, persist them</li>
 *   <li>Persist runners</li>
 *   <li>Persist users/members/events</li>
 *   <li>Retention cleanup</li>
 *   <li>Mark sync completed</li>
 * </ol>
 *
 * <p>Idempotent: re-running with unchanged GitLab data produces identical DB state.</p>
 */
@Service
public class AnalyticsSyncService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsSyncService.class);

    private final GitLabApiClient gitLabClient;
    private final EnvironmentRepository environmentRepository;
    private final AnalyticsSyncStorage syncStorage;
    private final SyncMetrics syncMetrics;
    private final AnalyticsProperties analyticsProperties;
    private final int retentionDays;
    private final boolean syncUsersEnabled;
    private final String pipelineHistoryDaysConfig;
    private final int syncIntervalSeconds;
    private final ExecutorService refreshExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "scoped-sync-refresh");
        t.setDaemon(true);
        return t;
    });

    public AnalyticsSyncService(GitLabApiClient gitLabClient,
                                 EnvironmentRepository environmentRepository,
                                 AnalyticsSyncStorage syncStorage,
                                 SyncMetrics syncMetrics,
                                 AnalyticsProperties analyticsProperties) {
        this.gitLabClient = gitLabClient;
        this.environmentRepository = environmentRepository;
        this.syncStorage = syncStorage;
        this.syncMetrics = syncMetrics;
        this.analyticsProperties = analyticsProperties;
        this.retentionDays = analyticsProperties.getRetentionDays();
        this.syncUsersEnabled = analyticsProperties.isSyncUsers();
        this.pipelineHistoryDaysConfig = analyticsProperties.getPipelineHistoryDays();
        this.syncIntervalSeconds = analyticsProperties.getSyncIntervalSeconds();
    }

    public int getSyncIntervalSeconds() {
        return analyticsProperties.getSyncIntervalSeconds();
    }

    // ─── Sync orchestrator ────────────────────────────────────

    /**
     * Run a full synchronization of all enabled environments.
     *
     * @return SyncResult with success/failure per environment
     */
    public SyncResult syncAll() {
        return syncAll(false);
    }

    /**
     * Run a full synchronization. If manual=true, mark the start immediately
     * and skip the mutex check (manual sync is expected to be exclusive).
     */
    public SyncResult syncAll(boolean manual) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) {
            return new SyncResult(true, "No enabled environments", 0, 0, 0, 0);
        }

        syncStorage.markSyncStarted();
        int totalProjects = 0, totalPipelines = 0, totalJobs = 0;
        int failCount = 0;
        StringBuilder errorSummary = new StringBuilder();

        syncMetrics.recordSyncStart();
        long syncStart = System.currentTimeMillis();

        for (EnvironmentClientConfig config : clients) {
            try {
                List<Long> groupIds = config.groupIds();
                if (groupIds.isEmpty()) continue;

                long namespaceId = config.index();
                for (long nativeGroup : groupIds) {
                    try {
                        // gitlab_environments.group_ids stores native GitLab group ids;
                        // they are the single DB key for analytics rows, and every
                        // GitLab API call uses the same native id.
                        SyncResult envResult = syncGroup(nativeGroup, namespaceId);
                        totalProjects += envResult.projectsSynced();
                        totalPipelines += envResult.pipelinesSynced();
                        totalJobs += envResult.jobsSynced();
                    } catch (Exception e) {
                        failCount++;
                        String safeMsg = getSafeMessage(e);
                        log.error("Sync failed for group {} in env {}: {}",
                                nativeGroup, config.name(), safeMsg);
                        if (errorSummary.length() > 0) errorSummary.append("; ");
                        errorSummary.append("Group ").append(nativeGroup)
                                .append(" in ").append(config.name()).append(": ")
                                .append(safeMsg);
                    }
                }
            } catch (Exception e) {
                failCount++;
                String safeMsg = getSafeMessage(e);
                log.error("Sync failed for environment {}: {}", config.name(), safeMsg);
                if (errorSummary.length() > 0) errorSummary.append("; ");
                errorSummary.append(config.name()).append(": ").append(safeMsg);
            }
        }

        long durationMs = System.currentTimeMillis() - syncStart;

        boolean success = failCount == 0;
        String message = success ? "Completed" :
                "Completed with " + failCount + " error(s): " + errorSummary;

        // Retention cleanup — runs AFTER markSyncCompleted so that
        // freshly persisted pipelines are committed before deletions.
        // Uses syncStart as the cutoff anchor so pipelines fetched during
        // this run are never pruned.
        try {
            syncStorage.markSyncCompleted();
            if (success) {
                syncStorage.runRetentionCleanup(retentionDays, syncStart);
            }
            if (success) {
                syncMetrics.recordSyncSuccess(totalProjects, totalPipelines, totalJobs, durationMs);
            } else {
                syncMetrics.recordSyncFailure(durationMs);
            }
        } catch (Exception e) {
            syncStorage.markSyncCompleted();
            log.warn("Retention cleanup failed: {}", getSafeMessage(e));
            if (success) {
                message = getSafeMessage(e);
            } else {
                message = message + " cleanup=" + getSafeMessage(e);
            }
            success = false;
            syncMetrics.recordSyncFailure(durationMs);
        }

        return new SyncResult(success, message, totalProjects, totalPipelines, totalJobs, durationMs);
    }

    /**
     * Run an on-demand, single-group refresh asynchronously.
     *
     * <p>Called from the Pipelines Refresh button so newly created pipelines
     * appear promptly instead of waiting for the next scheduled cycle. The run
     * is scoped to one environment + one group: it uses that environment's own
     * GitLab URL/token and the group's native GitLab id at the external API
     * boundary. Duplicate refreshes for the same group are rejected so a second
     * click (or rapid repeated clicks) never double-fetch the same group.
     *
     * <p>Unlike the periodic {@code syncAll}, this does not gate on the global
     * {@code isSyncRunning} flag: that flag can be left "stuck" true after an
     * interrupted full sync (see the sync-state record), which is exactly the
     * situation the Refresh button must recover from. The single-thread executor
     * serializes concurrent scoped refreshes, and per-group upserts are
     * idempotent, so a scoped refresh running alongside the scheduler is safe.</p>
     *
     * @return "accepted" if the refresh started, or "rejected:&lt;reason&gt;" if one
     *         is already in flight for the same group (or the env/group is unknown)
     */
    public String refreshScope(long environmentId, long groupIdParam) {
        long namespaceId;
        try {
            namespaceId = gitLabClient.namespaceForEnvironmentId(environmentId);
        } catch (IllegalArgumentException e) {
            return "rejected:" + e.getMessage();
        }
        /* The frontend sends the group's federated id (namespace<<44 | nativeId);
           for namespace 0 the encoding degrades to the bare native id, which is
           why a declared namespace of zero only matches an environment whose own
           namespace is zero. The selected environment's namespace is validated
           against the id's high bits so a group from another environment can
           never trigger a fetch under this environment's URL/token. */
        long[] decoded = FederatedIdUtility.decode(groupIdParam);
        long nativeGroupId = decoded[1];
        long declaredNs = decoded[0];
        boolean nsMatches = declaredNs != 0 ? declaredNs == namespaceId : namespaceId == 0;
        if (!nsMatches) {
            return "rejected:group does not belong to the selected environment";
        }
        if (nativeGroupId <= 0) {
            return "rejected:invalid group id";
        }
        if (!refreshScopeInFlight.add(FederatedIdUtility.encode(namespaceId, nativeGroupId))) {
            return "rejected:a refresh for this group is already in progress";
        }
        String scopeKey = AnalyticsSyncStorage.scopedRefreshScope(namespaceId, nativeGroupId);
        log.info("SCOPED_REFRESH envId={} federatedGroupId={} nativeGroupId={} namespaceId={} gitlabUrl={} state=accepted",
                environmentId, groupIdParam, nativeGroupId, namespaceId,
                gitLabClient.describeClientForNamespace(namespaceId));
        long syncStartMs = System.currentTimeMillis();
        refreshExecutor.submit(() -> {
            try {
                syncStorage.markSyncStarted(scopeKey);
                log.info("SCOPED_REFRESH envId={} nativeGroupId={} namespaceId={} scope={} state=started",
                        environmentId, nativeGroupId, namespaceId, scopeKey);
                SyncResult result = syncGroup(nativeGroupId, namespaceId);
                syncStorage.markSyncCompleted(scopeKey, result.success() ? null : result.message());
                log.info("SCOPED_REFRESH envId={} nativeGroupId={} namespaceId={} scope={} state={} durationMs={} projects={} pipelines={} jobs={}",
                        environmentId, nativeGroupId, namespaceId, scopeKey,
                        result.success() ? "completed" : "completed_with_error",
                        System.currentTimeMillis() - syncStartMs,
                        result.projectsSynced(), result.pipelinesSynced(), result.jobsSynced());
            } catch (Exception e) {
                String safeMsg = getSafeMessage(e);
                log.error("SCOPED_REFRESH envId={} nativeGroupId={} namespaceId={} scope={} state=failed durationMs={}: {}",
                        environmentId, nativeGroupId, namespaceId, scopeKey,
                        System.currentTimeMillis() - syncStartMs, safeMsg);
                try {
                    syncStorage.markSyncCompleted(scopeKey, safeMsg);
                } catch (Exception ignored) {
                    // never throw from the worker thread
                }
            } finally {
                refreshScopeInFlight.remove(FederatedIdUtility.encode(namespaceId, nativeGroupId));
            }
        });
        return "accepted";
    }

    /**
     * True while a scoped refresh for this environment + group is running
     * (used to disable the Refresh button).
     */
    public boolean isScopedRefreshInFlight(long environmentId, long groupIdParam) {
        long namespaceId;
        try {
            namespaceId = gitLabClient.namespaceForEnvironmentId(environmentId);
        } catch (IllegalArgumentException e) {
            return false;
        }
        long nativeGroupId = FederatedIdUtility.decode(groupIdParam)[1];
        if (nativeGroupId <= 0) {
            return false;
        }
        return refreshScopeInFlight.contains(FederatedIdUtility.encode(namespaceId, nativeGroupId));
    }

    private final Set<Long> refreshScopeInFlight = ConcurrentHashMap.newKeySet();

    @PreDestroy
    void shutdownRefreshExecutor() {
        refreshExecutor.shutdownNow();
    }

    /**
     * Sync a single group's pipeline data.
     *
     * <p>{@code nativeGroupId} is the canonical GitLab group id for
     * {@code namespaceId}: gitlab_environments.group_ids stores native ids, and
     * every GitLab API call plus every persisted analytics row is keyed by this
     * exact value. No federated encoding/decoding is involved here.
     */
    private SyncResult syncGroup(long nativeGroupId, long namespaceId) {
        log.info("SYNC group nativeGroupId={} namespaceId={} gitlabUrl={} fetchingProjects",
                nativeGroupId, namespaceId,
                gitLabClient.describeClientForNamespace(namespaceId));

        List<Map<String, Object>> gitlabProjects = gitLabClient.getAllProjectsForGroup(
                nativeGroupId, true, namespaceId);

        if (gitlabProjects.isEmpty()) {
            log.info("SYNC group nativeGroupId={} namespaceId={} state=empty projects=0",
                    nativeGroupId, namespaceId);
            return new SyncResult(true, "No projects", 0, 0, 0, 0);
        }

        log.info("SYNC group nativeGroupId={} namespaceId={} state=projects_fetched gitlabProjects={}",
                nativeGroupId, namespaceId, gitlabProjects.size());

        int projectsSynced = syncStorage.upsertProjects(gitlabProjects, nativeGroupId, namespaceId);
        log.info("SYNC group nativeGroupId={} namespaceId={} state=projects_written written={}",
                nativeGroupId, namespaceId, projectsSynced);

        // Runner inventory is independent of the expensive per-project pipeline/job
        // history. Persist it early so a large group cannot leave the Runners page
        // waiting for the entire analytics cycle to finish.
        try {
            List<Map<String, Object>> runners = gitLabClient.getRunnersForGroup(nativeGroupId, namespaceId);
            Map<String, Object> runnerPayload = new LinkedHashMap<>();
            runnerPayload.put("payload", runners != null ? runners : new ArrayList<>());
            syncStorage.upsertRunnerState(nativeGroupId, runnerPayload);
            log.info("SYNC group nativeGroupId={} namespaceId={} state=runners_written runners={}",
                    nativeGroupId, namespaceId, runners != null ? runners.size() : 0);
        } catch (Exception e) {
            log.warn("Runner sync failed for group {}: {}", nativeGroupId, getSafeMessage(e));
        }

        // Member discovery must not wait for hundreds of projects' pipeline/job histories.
        // Populate the User Activity directory first, then continue the heavier analytics sync.
        if (syncUsersEnabled) {
            try {
                syncUsersForGroup(nativeGroupId, gitlabProjects, namespaceId);
            } catch (Exception e) {
                log.warn("User sync failed for group {}: {}", nativeGroupId, getSafeMessage(e));
            }
        }

        int totalPipelines = 0, totalJobs = 0;
        String updatedAfter = calculateUpdatedAfter(pipelineHistoryDaysConfig);

        for (Map<String, Object> proj : gitlabProjects) {
            try {
                long projectId = ((Number) proj.get("id")).longValue();
                String defaultBranch = (String) proj.get("default_branch");

                if (defaultBranch == null || defaultBranch.isEmpty()) continue;
                if (Boolean.FALSE.equals(proj.get("jobs_enabled"))) continue;

                List<Map<String, Object>> pipelines = gitLabClient.getPipelinesForProject(projectId, updatedAfter, namespaceId);
                int pipelineCount = syncStorage.upsertPipelines(pipelines, projectId);
                totalPipelines += pipelineCount;

                for (Map<String, Object> pipeline : pipelines) {
                    long pipelineGitlabId = ((Number) pipeline.get("id")).longValue();
                    Object authorIdRaw = pipeline.get("author_id");
                    long pipelineAuthorId = authorIdRaw != null ? ((Number) authorIdRaw).longValue() : 0L;

                    List<Map<String, Object>> jobs = gitLabClient.getJobsForPipeline(projectId, pipelineGitlabId, namespaceId);
                    int jobCount = syncStorage.upsertJobs(jobs, pipelineGitlabId, projectId, pipelineAuthorId);
                    totalJobs += jobCount;
                }
            } catch (Exception e) {
                log.debug("Pipeline/job sync failed for project {}: {}", proj.get("id"), getSafeMessage(e));
            }
        }

        String msg = String.format("Synced %d projects, %d pipelines, %d jobs",
                projectsSynced, totalPipelines, totalJobs);
        log.info("SYNC group nativeGroupId={} namespaceId={} state=completed projects={} pipelines={} jobs={}",
                nativeGroupId, namespaceId, projectsSynced, totalPipelines, totalJobs);
        return new SyncResult(true, msg, projectsSynced, totalPipelines, totalJobs, 0);
    }

    private String calculateUpdatedAfter(String pipelineHistoryDaysConfig) {
        try {
            int days = Integer.parseInt(pipelineHistoryDaysConfig);
            return Instant.now().minus(days, ChronoUnit.DAYS).toString();
        } catch (NumberFormatException e) {
            return Instant.now().minus(30, ChronoUnit.DAYS).toString();
        }
    }

    private void syncUsersForGroup(long groupId, List<Map<String, Object>> gitlabProjects,
                                    long namespaceId) {
        // Never let rate-limited membership discovery block the activity payload.
        // Existing users and event authors provide the required FK/user directory.
        syncProjectActivity(groupId, gitlabProjects, namespaceId);

        List<Map<String, Object>> groupMembers = gitLabClient.getGroupMembersRecursive(
                groupId, namespaceId);

        Map<Long, Map<String, Object>> allUsers = new LinkedHashMap<>();
        for (Map<String, Object> member : groupMembers) {
            if (member.get("id") instanceof Number id) allUsers.put(id.longValue(), member);
        }
        // Make recursive group membership visible immediately; project discovery may be large.
        syncStorage.upsertUsers(new ArrayList<>(allUsers.values()), groupId);

        int projectsProcessed = 0;
        for (Map<String, Object> proj : gitlabProjects) {
            long projectId = ((Number) proj.get("id")).longValue();
            try {
                List<Map<String, Object>> projectMembers = gitLabClient.getProjectMembers(projectId, namespaceId);
                List<Map<String, Object>> relations = new ArrayList<>(projectMembers.size());
                for (Map<String, Object> member : projectMembers) {
                    if (!(member.get("id") instanceof Number idNum)) continue;
                    long userId = idNum.longValue();
                    String username = (String) member.get("username");
                    memberUsernames.putIfAbsent(userId, username);
                    allUsers.putIfAbsent(userId, member);

                    Map<String, Object> rel = new HashMap<>(2);
                    rel.put("user_id", userId);
                    rel.put("project_id", projectId);
                    relations.add(rel);
                }
                syncStorage.upsertUserProjectRelations(relations, groupId);
            } catch (Exception e) {
                // One private/rate-limited project must not abort every later project.
                log.debug("Project member sync failed for project {}: {}", projectId, getSafeMessage(e));
            }
            projectsProcessed++;
            if (projectsProcessed % 25 == 0) {
                syncStorage.upsertUsers(new ArrayList<>(allUsers.values()), groupId);
            }
        }
        syncStorage.upsertUsers(new ArrayList<>(allUsers.values()), groupId);
    }

    private void syncProjectActivity(long groupId, List<Map<String, Object>> gitlabProjects,
                                      long namespaceId) {
        int storedEvents = 0;
        int storedIssues = 0;
        for (Map<String, Object> proj : gitlabProjects) {
            long projectId = ((Number) proj.get("id")).longValue();
            try {
                String eventsAfter = syncStorage.latestUserEventAt(projectId)
                    .map(value -> value.minus(1, ChronoUnit.DAYS).toLocalDate().toString())
                    .orElseGet(() -> java.time.LocalDate.now().minusDays(retentionDays).toString());
                List<Map<String, Object>> events = gitLabClient.getProjectEvents(projectId, eventsAfter, namespaceId);
                syncStorage.upsertEvents(events, groupId, projectId);
                storedEvents += events.size();
            } catch (Exception e) {
                log.debug("Event sync failed for project {}: {}", projectId, getSafeMessage(e));
            }

            try {
                String issuesAfter = syncStorage.latestUserIssueAt(projectId)
                    .map(value -> value.minus(1, ChronoUnit.DAYS).toString())
                    .orElseGet(() -> Instant.now().minus(retentionDays, ChronoUnit.DAYS).toString());
                List<Map<String, Object>> issues = gitLabClient.getProjectIssues(projectId, issuesAfter, namespaceId);
                syncStorage.upsertIssues(issues, groupId, projectId);
                storedIssues += issues.size();
            } catch (Exception e) {
                log.debug("Issue sync failed for project {}: {}", projectId, getSafeMessage(e));
            }
        }
        log.info("Stored/refreshed {} user events and {} issues for group {}",
            storedEvents, storedIssues, groupId);
    }

    private final Map<Long, String> memberUsernames = new HashMap<>();

    private String getSafeMessage(Throwable e) {
        String msg = e.getMessage();
        if (msg == null) return e.getClass().getSimpleName();
        return msg.replaceAll("(?-i)(PRIVATE-TOKEN:\\s*)[A-Za-z0-9_-]+", "$1[REDACTED]")
                  .replaceAll("(?-i)(Bearer\\s+)[A-Za-z0-9._-]+", "$1[REDACTED]");
    }

    // ─── Sync state ────────────────────────────────────────────

    public boolean isSyncRunning() {
        return syncStorage.isSyncRunning();
    }

    public String getSyncStatus() {
        return syncStorage.getSyncStatus();
    }

    public SyncResult triggerManualSync() {
        log.info("Manual sync triggered");
        return syncAll(true);
    }

    public record SyncResult(
            boolean success,
            String message,
            int projectsSynced,
            int pipelinesSynced,
            int jobsSynced,
            long durationMs
    ) {}
}
