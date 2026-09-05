package com.gitlabops.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Database persistence layer for the sync engine.
 *
 * <p>All operations use INSERT ... ON CONFLICT DO UPDATE for idempotent upserts.
 * Table names and columns match the existing PostgreSQL schema from migrations 0001-0023.</p>
 */
@Repository
public class AnalyticsSyncStorage {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsSyncStorage.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final JdbcTemplate jdbcTemplate;

    public AnalyticsSyncStorage(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // ─── Timestamp helper ──────────────────────────────────────

    /**
     * Parse a timestamp or return null if the string is empty/blank.
     */
    private OffsetDateTime safeOffsetDateTime(String dateStr) {
        if (dateStr == null || dateStr.isEmpty()) return null;
        try {
            return OffsetDateTime.parse(dateStr.replace("Z", "+00:00"));
        } catch (Exception e) {
            return null;
        }
    }

    private OffsetDateTime toOffsetDateTime(String dateStr) {
        if (dateStr == null || dateStr.isEmpty()) return OffsetDateTime.now();
        try {
            return OffsetDateTime.parse(dateStr.replace("Z", "+00:00"));
        } catch (Exception e) {
            return OffsetDateTime.now();
        }
    }

    // ─── Sync state ────────────────────────────────────────────

    volatile boolean syncing = false;

    /** Global scope used by the scheduled full sync and readiness fallback. */
    public static final String SCOPED_SYNC_SCOPE = "pipelines";

    /** Scope key for on-demand, single-group scoped refreshes. */
    public static String scopedRefreshScope(long namespaceId, long nativeGroupId) {
        return "refresh:" + namespaceId + ":" + nativeGroupId;
    }

    public void markSyncStarted() {
        markSyncStarted(SCOPED_SYNC_SCOPE);
    }

    public void markSyncStarted(String scope) {
        if (SCOPED_SYNC_SCOPE.equals(scope)) {
            syncing = true;
        }
        try {
            jdbcTemplate.update(
                "INSERT INTO analytics_sync_state(scope, last_started_at, last_error) " +
                "VALUES(?, NOW(), NULL) ON CONFLICT (scope) DO UPDATE SET " +
                "last_started_at = NOW(), last_error = NULL",
                scope);
        } catch (Exception e) {
            log.warn("Failed to mark sync started for scope {}: {}", scope, e.getMessage());
        }
    }

    public void markSyncCompleted() {
        markSyncCompleted(SCOPED_SYNC_SCOPE, null);
    }

    /**
     * Mark the sync finished for the global "pipelines" scope. When
     * {@code lastError} is non-null the error is persisted so readiness surfaces
     * the failure instead of reporting a clean completed sync (a failed run must
     * not be treated as fresh).
     */
    public void markSyncCompleted(String lastError) {
        markSyncCompleted(SCOPED_SYNC_SCOPE, lastError);
    }

    /** Mark the sync finished for an arbitrary scope (e.g. a scoped refresh). */
    public void markSyncCompleted(String scope, String lastError) {
        String safe = lastError == null ? null : lastError.length() > 2000 ? lastError.substring(0, 2000) : lastError;
        try {
            jdbcTemplate.update(
                "INSERT INTO analytics_sync_state(scope, last_completed_at, last_error) " +
                "VALUES(?, NOW(), ?) ON CONFLICT (scope) DO UPDATE SET " +
                "last_completed_at = NOW(), last_error = ?",
                scope, safe, safe);
        } catch (Exception e) {
            log.warn("Failed to mark sync completed for scope {}: {}", scope, e.getMessage());
        }
        if (SCOPED_SYNC_SCOPE.equals(scope)) {
            syncing = false;
        }
    }

    /** Read the state row for the given scope (or empty if none). */
    public java.util.Optional<java.util.Map<String, Object>> getSyncStateRow(String scope) {
        try {
            java.util.List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT last_started_at, last_completed_at, last_error FROM analytics_sync_state WHERE scope = ?",
                scope);
            if (rows != null && !rows.isEmpty()) {
                return java.util.Optional.of(rows.get(0));
            }
        } catch (Exception e) {
            log.warn("Failed to read sync state for scope {}: {}", scope, e.getMessage());
        }
        return java.util.Optional.empty();
    }

    public boolean isSyncRunning() {
        return syncing;
    }

    public String getSyncStatus() {
        return syncing ? "syncing" : "idle";
    }

    // ─── Projects ──────────────────────────────────────────────

    public int upsertProjects(List<Map<String, Object>> projects, long groupId, long namespaceId) {
        if (projects == null || projects.isEmpty()) return 0;
        int count = 0;
        for (Map<String, Object> proj : projects) {
            try {
                long gitlabId = ((Number) proj.get("id")).longValue();
                String name = (String) proj.get("name");
                String path = (String) proj.getOrDefault("path", "");
                String webUrl = (String) proj.getOrDefault("web_url", "");
                String defaultBranch = (String) proj.getOrDefault("default_branch", "");
                @SuppressWarnings("unchecked")
                List<String> topics = proj.containsKey("topics") && proj.get("topics") != null ?
                        (List<String>) proj.get("topics") : new ArrayList<>();
                boolean jobsEnabled = Boolean.TRUE.equals(proj.get("jobs_enabled"));
                String namespacePath = "";
                long namespacePid = 0L;

                if (proj.get("namespace") instanceof Map<?, ?> nsMap) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> ns = (Map<String, Object>) nsMap;
                    namespacePath = (String) ns.getOrDefault("full_path", "");
                    Integer nsParent = (Integer) ns.get("parent_id");
                    if (nsParent != null) {
                        namespacePid = nsParent.longValue();
                    }
                }

                String topicsJson = OBJECT_MAPPER.writeValueAsString(topics);

                String sql = "INSERT INTO analytics_projects(gitlab_id, group_id, name, path, web_url, " +
                    "default_branch, namespace_path, topics, jobs_enabled, last_seen_at, " +
                    "namespace_id, namespace_parent_id) " +
                    "VALUES(?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, NOW(), ?, ?) " +
                    "ON CONFLICT (gitlab_id) DO UPDATE SET " +
                    "name = EXCLUDED.name, path = EXCLUDED.path, web_url = EXCLUDED.web_url, " +
                    "default_branch = EXCLUDED.default_branch, namespace_path = EXCLUDED.namespace_path, " +
                    "topics = EXCLUDED.topics, jobs_enabled = EXCLUDED.jobs_enabled, " +
                    "last_seen_at = NOW(), namespace_id = EXCLUDED.namespace_id, " +
                    "namespace_parent_id = EXCLUDED.namespace_parent_id";

                jdbcTemplate.update(sql,
                        gitlabId, groupId, name, path, webUrl, defaultBranch,
                        namespacePath, topicsJson, jobsEnabled, namespaceId, namespacePid);
                count++;
            } catch (Exception e) {
                log.debug("Failed to upsert project: {}", e.getMessage());
            }
        }
        return count;
    }

    // ─── Pipelines ─────────────────────────────────────────────

    public int upsertPipelines(List<Map<String, Object>> pipelines, long projectId) {
        if (pipelines == null || pipelines.isEmpty()) return 0;
        int count = 0;
        for (Map<String, Object> pipeline : pipelines) {
            try {
                long gitlabId = ((Number) pipeline.get("id")).longValue();
                long iid = ((Number) pipeline.getOrDefault("iid", 0L)).longValue();
                String sha = (String) pipeline.getOrDefault("sha", "");
                String ref = (String) pipeline.getOrDefault("ref", "");
                String status = (String) pipeline.getOrDefault("status", "");
                String source = (String) pipeline.getOrDefault("source", "");
                String createdAtStr = (String) pipeline.getOrDefault("created_at", "");
                String updatedAtStr = (String) pipeline.getOrDefault("updated_at", "");
                String webUrl = (String) pipeline.getOrDefault("web_url", "");
                Double coverage = pipeline.get("coverage") != null ?
                        ((Number) pipeline.get("coverage")).doubleValue() : null;
                Long authorId = pipeline.get("author_id") != null ?
                        ((Number) pipeline.get("author_id")).longValue() : null;

                OffsetDateTime createdAt = toOffsetDateTime(createdAtStr);
                OffsetDateTime updatedAt = toOffsetDateTime(updatedAtStr);

                String sql = "INSERT INTO analytics_pipelines(gitlab_id, iid, project_id, sha, branch, " +
                    "status, source, coverage, created_at, updated_at, web_url, author_id) " +
                    "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                    "ON CONFLICT (gitlab_id) DO UPDATE SET " +
                    "iid = EXCLUDED.iid, sha = EXCLUDED.sha, branch = EXCLUDED.branch, " +
                    "status = EXCLUDED.status, source = EXCLUDED.source, " +
                    "coverage = EXCLUDED.coverage, created_at = EXCLUDED.created_at, " +
                    "updated_at = EXCLUDED.updated_at, web_url = EXCLUDED.web_url, " +
                    "author_id = EXCLUDED.author_id";

                jdbcTemplate.update(sql,
                        gitlabId, iid, projectId, sha, ref, status, source,
                        coverage, createdAt, updatedAt, webUrl, authorId);
                count++;
            } catch (Exception e) {
                log.debug("Failed to upsert pipeline: {}", e.getMessage());
            }
        }
        return count;
    }

    // ─── Jobs ──────────────────────────────────────────────────

    /**
     * Upsert jobs for a pipeline.
     */
    public int upsertJobs(List<Map<String, Object>> jobs, long pipelineGitlabId,
                          long projectId, long authorId) {
        if (jobs == null || jobs.isEmpty()) return 0;
        int count = 0;
        for (Map<String, Object> job : jobs) {
            long gitlabId = 0L;
            try {
                gitlabId = ((Number) job.get("id")).longValue();
                String name = (String) job.getOrDefault("name", "");
                String stage = (String) job.getOrDefault("stage", "");
                String status = (String) job.getOrDefault("status", "");
                String ref = (String) job.getOrDefault("ref", "");
                String createdAtStr = (String) job.getOrDefault("created_at", "");
                String webUrl = (String) job.getOrDefault("web_url", "");
                Boolean allowFailure = job.get("allow_failure") != null ?
                        (Boolean) job.get("allow_failure") : false;

                OffsetDateTime createdAt = toOffsetDateTime(createdAtStr);

                String finishedAtStr = (String) job.getOrDefault("finished_at", "");
                OffsetDateTime finishedAt = toOffsetDateTime(finishedAtStr);

                Double duration = null;
                if (job.get("duration") != null) {
                    duration = ((Number) job.get("duration")).doubleValue();
                }

                Double queuedDuration = null;
                if (job.get("queued_duration") != null) {
                    queuedDuration = ((Number) job.get("queued_duration")).doubleValue();
                }

                String startedAtStr = (String) job.getOrDefault("started_at", "");
                OffsetDateTime startedAt = toOffsetDateTime(startedAtStr);

                String whenKeyword = (String) job.getOrDefault("when", "on_success");

                String triggerType = (String) job.getOrDefault("trigger", null);

                Long runnerId = null;
                if (job.get("runner_id") != null) {
                    runnerId = ((Number) job.get("runner_id")).longValue();
                }

                String runnerName = (String) job.getOrDefault("runner_name", null);
                String runnerDescription = (String) job.getOrDefault("runner_description", null);

                Object commitObj = job.get("commit");
                String commitSha = null;
                String commitShortMessage = null;
                if (commitObj instanceof String s) {
                    commitSha = s;
                } else if (commitObj instanceof Map<?, ?> m) {
                    commitSha = (String) m.get("id");
                    if (commitSha == null) commitSha = (String) m.get("sha");
                    commitShortMessage = (String) m.get("short_message");
                    if (commitShortMessage == null) commitShortMessage = (String) m.get("message");
                    if (commitShortMessage == null) commitShortMessage = (String) m.get("title");
                }

                Object tagListObj = job.get("tag_list");
                String tagListJson = "[]";
                if (tagListObj != null) {
                    if (tagListObj instanceof Object[] arr) {
                        tagListJson = OBJECT_MAPPER.writeValueAsString(arr);
                    } else if (tagListObj instanceof java.util.List<?> list) {
                        @SuppressWarnings("unchecked")
                        Object[] arr2 = list.toArray();
                        tagListJson = OBJECT_MAPPER.writeValueAsString(arr2);
                    } else {
                        tagListJson = OBJECT_MAPPER.writeValueAsString(tagListObj);
                    }
                }

        String failureReason = (String) job.getOrDefault("failure_reason", null);

        // Extract parent_job_id from GitLab needs array (for DAG pipeline dependencies)
        // The needs field contains job_ids of parent jobs; we take the first pipeline-local entry.
        Long parentJobId = null;
        if (job.get("needs") != null && job.get("needs") instanceof java.util.List<?> needsList) {
            for (Object needObj : needsList) {
                if (needObj instanceof Map<?, ?> needMap) {
                    Object jobIdObj = needMap.get("job_id");
                    if (jobIdObj instanceof Number jobIdNum) {
                        long jobId = jobIdNum.longValue();
                        // Only set parent if it's not this same job (skip self-reference)
                        if (jobId > 0 && jobId != gitlabId) {
                            parentJobId = jobId;
                            break;
                        }
                    }
                    // Also check for parent_id within the need entry as fallback
                    if (parentJobId == null) {
                        Object parentObj = needMap.get("parent_id");
                        if (parentObj instanceof Number parentNum) {
                            long parentId = parentNum.longValue();
                            if (parentId > 0 && parentId != gitlabId) {
                                parentJobId = parentId;
                                break;
                            }
                        }
                    }
                }
            }
        }
        // Fall back: try direct parent_id field on the job (for manual job children)
        if (parentJobId == null && job.get("parent_id") != null) {
            Object parentIdObj = job.get("parent_id");
            if (parentIdObj instanceof Number parentIdNum) {
                long parentId = parentIdNum.longValue();
                if (parentId > 0 && parentId != gitlabId) {
                    parentJobId = parentId;
                }
            }
        }

        String sql = "INSERT INTO analytics_jobs(gitlab_id, pipeline_id, project_id, name, " +
            "stage, branch, status, allow_failure, created_at, web_url, " +
            "finished_at, duration, queued_duration, started_at, " +
            "when_keyword, trigger_keyword, runner_id, runner_name, " +
            "runner_description, commit_sha, commit_short_message, " +
            "job_tags, failure_reason, parent_job_id, collected_at) " +
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, " +
            "?, ?, ?, ?, ?, ?, ?, NOW()) " +
            "ON CONFLICT (gitlab_id) DO UPDATE SET " +
            "name = EXCLUDED.name, stage = EXCLUDED.stage, branch = EXCLUDED.branch, " +
            "status = EXCLUDED.status, allow_failure = EXCLUDED.allow_failure, " +
            "created_at = EXCLUDED.created_at, web_url = EXCLUDED.web_url, " +
            "finished_at = EXCLUDED.finished_at, duration = EXCLUDED.duration, " +
            "queued_duration = EXCLUDED.queued_duration, started_at = EXCLUDED.started_at, " +
            "when_keyword = EXCLUDED.when_keyword, trigger_keyword = EXCLUDED.trigger_keyword, " +
            "runner_id = EXCLUDED.runner_id, runner_name = EXCLUDED.runner_name, " +
            "runner_description = EXCLUDED.runner_description, " +
            "commit_sha = EXCLUDED.commit_sha, commit_short_message = EXCLUDED.commit_short_message, " +
            "job_tags = EXCLUDED.job_tags, failure_reason = EXCLUDED.failure_reason, " +
            "parent_job_id = EXCLUDED.parent_job_id";

        jdbcTemplate.update(sql,
                gitlabId, pipelineGitlabId, projectId, name, stage, ref, status,
                allowFailure, createdAt, webUrl, finishedAt, duration, queuedDuration,
                startedAt, whenKeyword, triggerType, runnerId, runnerName,
                runnerDescription, commitSha, commitShortMessage, tagListJson, failureReason,
                parentJobId);
                count++;
            } catch (Exception ex) {
                // e.printStackTrace();
                log.error("Failed to upsert job: pipeline=" + pipelineGitlabId + " gitlabId=" + gitlabId, ex);
            }
        }
        return count;
    }

    // ─── Runners ───────────────────────────────────────────────

    public void upsertRunnerState(long groupId, Map<String, Object> payload) {
        try {
            String payloadJson = OBJECT_MAPPER.writeValueAsString(payload.get("payload"));
            jdbcTemplate.update(
                "INSERT INTO analytics_runner_state(group_id, payload, collected_at) " +
                "VALUES(?, CAST(? AS jsonb), NOW()) ON CONFLICT (group_id) DO UPDATE SET " +
                "payload = EXCLUDED.payload, collected_at = NOW()",
                groupId, payloadJson);
        } catch (Exception e) {
            log.debug("Failed to upsert runner state: {}", e.getMessage());
        }
    }

    // ─── Users ─────────────────────────────────────────────────

    public void upsertUsers(List<Map<String, Object>> memberList, long groupId) {
        if (memberList == null || memberList.isEmpty()) return;
        for (Map<String, Object> member : memberList) {
            try {
                long userId = ((Number) member.get("id")).longValue();
                String username = (String) member.getOrDefault("username", "");
                String name = (String) member.getOrDefault("name", "");
                String email = (String) member.getOrDefault("email", "");
                String state = (String) member.getOrDefault("state", "active");
                String avatarUrl = (String) member.getOrDefault("avatar_url", "");
                String webUrl = (String) member.getOrDefault("web_url", "");

                Integer existing = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM analytics_users WHERE gitlab_id = ?",
                    Integer.class, userId);

                if (existing != null && existing > 0) {
                    jdbcTemplate.update(
                        "UPDATE analytics_users SET username=?, name=?, email=?, state=?, " +
                        "avatar_url=?, web_url=?, is_current_member=TRUE, " +
                        "collected_at=NOW() WHERE gitlab_id=?",
                        username, name, email, state, avatarUrl, webUrl, userId);
                } else {
                    String uname = username != null && !username.isEmpty() ? username : "user-" + userId;
                    String nname = name != null && !name.isEmpty() ? name : "User " + userId;
                    jdbcTemplate.update(
                        "INSERT INTO analytics_users(gitlab_id, group_id, username, name, email, " +
                        "avatar_url, web_url, state, is_admin, is_current_member) " +
                        "VALUES(?, ?, ?, ?, ?, ?, ?, ?, FALSE, TRUE)",
                        userId, groupId, uname, nname, email, avatarUrl, webUrl, state);
                }
            } catch (Exception e) {
                log.debug("Failed to upsert user: {}", e.getMessage());
            }
        }
    }

    // ─── User ↔ Project relations ──────────────────────────────

    /**
     * Record the user → project → group membership relations derived from
     * GitLab project membership during sync. Each triple is upserted on the
     * UNIQUE(user_id, project_id, group_id) key; relation_type / evidence_type
     * come from V25 (both NOT NULL, default 'membership' / 'unknown').
     */
    public int upsertUserProjectRelations(List<Map<String, Object>> projectMembers,
                                          long groupId) {
        if (projectMembers == null || projectMembers.isEmpty()) return 0;
        int count = 0;
        String sql = "INSERT INTO analytics_user_project_relations" +
            "(user_id, project_id, group_id, relation_type, evidence_type, synced_at) " +
            "VALUES(?, ?, ?, 'membership', 'project_member', NOW()) " +
            "ON CONFLICT (user_id, project_id, group_id) DO UPDATE SET " +
            "synced_at = NOW(), " +
            "relation_type = EXCLUDED.relation_type, " +
            "evidence_type = EXCLUDED.evidence_type";
        for (Map<String, Object> m : projectMembers) {
            try {
                if (!(m.get("user_id") instanceof Number userIdNum)) continue;
                if (!(m.get("project_id") instanceof Number projectIdNum)) continue;
                jdbcTemplate.update(sql,
                    userIdNum.longValue(), projectIdNum.longValue(), groupId);
                count++;
            } catch (Exception e) {
                log.debug("Failed to upsert user-project relation: {}", e.getMessage());
            }
        }
        return count;
    }

    // ─── Events ────────────────────────────────────────────────

    public void upsertEvents(List<Map<String, Object>> events, long groupId, long projectId) {
        if (events == null || events.isEmpty()) return;
        List<Map<String, Object>> authors = new ArrayList<>();
        for (Map<String, Object> event : events) {
            if (event.get("author") instanceof Map<?, ?> rawAuthor) {
                @SuppressWarnings("unchecked")
                Map<String, Object> author = (Map<String, Object>) rawAuthor;
                if (author.get("id") instanceof Number) authors.add(author);
            }
        }
        // analytics_user_events.user_id is a foreign key; authors must exist first.
        upsertUsers(authors, groupId);

        for (Map<String, Object> event : events) {
            try {
                long eventId = ((Number) event.get("id")).longValue();
                Object userIdValue = event.get("user_id");
                if (!(userIdValue instanceof Number)) userIdValue = event.get("author_id");
                if (!(userIdValue instanceof Number) && event.get("author") instanceof Map<?, ?> author) {
                    userIdValue = author.get("id");
                }
                if (!(userIdValue instanceof Number userIdNumber) || userIdNumber.longValue() <= 0) {
                    continue;
                }
                long userId = userIdNumber.longValue();
                String actionName = (String) event.getOrDefault("action_name", "");
                String targetType = (String) event.getOrDefault("target_type", "");
                String createdAt = (String) event.getOrDefault("created_at", "");
                String occurredAt = event.get("occurred_at") != null ?
                        (String) event.get("occurred_at") : createdAt;

                OffsetDateTime odt = toOffsetDateTime(occurredAt);

                String sql = "INSERT INTO analytics_user_events(event_id, group_id, project_id, user_id, " +
                    "action_name, target_type, occurred_at, collected_at) " +
                    "VALUES(?, ?, ?, ?, ?, ?, ?, NOW()) " +
                    "ON CONFLICT (event_id) DO UPDATE SET " +
                    "action_name = EXCLUDED.action_name, target_type = EXCLUDED.target_type, " +
                    "occurred_at = EXCLUDED.occurred_at";

                jdbcTemplate.update(sql,
                        eventId, groupId, projectId, userId, actionName, targetType, odt);
            } catch (Exception e) {
                log.debug("Failed to upsert event: {}", e.getMessage());
            }
        }
    }

    public Optional<OffsetDateTime> latestUserEventAt(long projectId) {
        return Optional.ofNullable(jdbcTemplate.queryForObject(
            "SELECT MAX(occurred_at) FROM analytics_user_events WHERE project_id = ?",
            OffsetDateTime.class, projectId));
    }

    public Optional<OffsetDateTime> latestUserIssueAt(long projectId) {
        return Optional.ofNullable(jdbcTemplate.queryForObject(
            "SELECT MAX(occurred_at) FROM analytics_user_issues WHERE project_id = ?",
            OffsetDateTime.class, projectId));
    }

    public void upsertIssues(List<Map<String, Object>> issues, long groupId, long projectId) {
        if (issues == null || issues.isEmpty()) return;
        List<Map<String, Object>> authors = new ArrayList<>();
        for (Map<String, Object> issue : issues) {
            try {
                Object authorValue = issue.get("author");
                if (!(authorValue instanceof Map<?, ?> rawAuthor)) continue;
                @SuppressWarnings("unchecked")
                Map<String, Object> author = (Map<String, Object>) rawAuthor;
                if (!(author.get("id") instanceof Number authorId)) continue;
                authors.add(author);

                long issueId = ((Number) issue.get("id")).longValue();
                String createdAt = String.valueOf(issue.getOrDefault("created_at", ""));
                jdbcTemplate.update(
                    "INSERT INTO analytics_user_issues(issue_id, group_id, project_id, user_id, occurred_at, collected_at) " +
                    "VALUES(?, ?, ?, ?, ?, NOW()) ON CONFLICT (issue_id) DO UPDATE SET " +
                    "group_id=EXCLUDED.group_id, project_id=EXCLUDED.project_id, " +
                    "user_id=EXCLUDED.user_id, occurred_at=EXCLUDED.occurred_at, collected_at=NOW()",
                    issueId, groupId, projectId, authorId.longValue(), toOffsetDateTime(createdAt));
            } catch (Exception e) {
                log.debug("Failed to upsert issue: {}", e.getMessage());
            }
        }
        upsertUsers(authors, groupId);
    }

    // ─── Retention cleanup ─────────────────────────────────────

    public void runRetentionCleanup(int retentionDays) {
        runRetentionCleanup(retentionDays, Instant.now().toEpochMilli());
    }

    /**
     * Delete rows older than {@code retentionDays} days before {@code syncStart}.
     * Passing the sync start timestamp as the cutoff anchor ensures that data
     * freshly fetched during this sync run is never accidentally pruned: the
     * window is anchored at the moment the sync began, not at "now" which may
     * be minutes later after all rows have been persisted.
     */
    public void runRetentionCleanup(int retentionDays, long syncStartMs) {
        try {
            int days = Math.max(1, retentionDays);
            String before = java.time.OffsetDateTime.ofInstant(
                Instant.ofEpochMilli(syncStartMs), java.time.ZoneOffset.UTC)
                .minusDays(days)
                .toString();
            jdbcTemplate.update(
                "DELETE FROM analytics_pipelines WHERE updated_at < ?", before);
            jdbcTemplate.update(
                "DELETE FROM analytics_runner_snapshots WHERE captured_at < ?", before);
            String summaryCutoff = java.time.OffsetDateTime.ofInstant(
                Instant.ofEpochMilli(syncStartMs), java.time.ZoneOffset.UTC)
                .minusDays(7)
                .toString();
            jdbcTemplate.execute(
                "DELETE FROM analytics_summary_cache WHERE computed_at < '" + summaryCutoff + "'");
            jdbcTemplate.update(
                "DELETE FROM analytics_user_events WHERE occurred_at < ?", before);
            jdbcTemplate.update(
                "DELETE FROM analytics_user_issues WHERE occurred_at < ?", before);
            log.info("Retention cleanup completed: deleted old pipelines/snapshots/cache " +
                     "(retention={}d, syncStart={}Z)",
                    retentionDays, before);
        } catch (Exception e) {
            log.warn("Retention cleanup failed after {} days: {}", retentionDays, e.getMessage());
        }
    }
}
