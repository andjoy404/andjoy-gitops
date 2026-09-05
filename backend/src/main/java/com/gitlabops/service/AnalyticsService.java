package com.gitlabops.service;

import com.gitlabops.model.dto.AnalyticsHistoryPoint;
import com.gitlabops.model.dto.AnalyticsReadiness;
import com.gitlabops.model.dto.AnalyticsSummary;
import com.gitlabops.model.dto.PaginatedPipelineResponse;
import com.gitlabops.model.dto.PaginatedUserActivity;
import com.gitlabops.model.dto.ProjectPipeline;
import com.gitlabops.model.dto.UserActivity;
import com.gitlabops.model.dto.UserMetrics;
import com.gitlabops.model.dto.UserProjectRelation;
import com.gitlabops.util.FederatedIdUtility;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jooq.Record;
import org.jooq.Result;
import org.jooq.DSLContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@ConditionalOnProperty(name = "analytics.enabled", havingValue = "true", matchIfMissing = false)
public class AnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsService.class);

    private final DSLContext dsl;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AnalyticsService(DSLContext dsl, DataSource dataSource) {
        this.dsl = dsl;
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    // ── Readiness ──────────────────────────────────────────────

    public AnalyticsReadiness getReadiness(String groupIdsCsv) {
        try {
            String[] groupIds = parseGroupIds(groupIdsCsv);
            if (!hasActivePool()) {
                return new AnalyticsReadiness(true, false, "", null, 0, 0, 0, 0, 0, 0);
            }

            // The scoped (single-group) readiness is derived from a dedicated sync
            // state row written by the scoped refresh (see AnalyticsSyncService.
            // refreshScope), keyed by the environment namespace + the native group
            // id — the exact identity the readiness caller asks about. The global
            // "pipelines" scope belongs to the scheduled full sync and must not make
            // a scoped readiness "syncing" mid-way through a 12-minute scheduled
            // cycle. Only a single-group query (the page's readiness) is scoped;
            // the namespace is recovered by decoding the caller's raw (federated)
            // group id, matching refreshScope's key exactly.
            String scopedScopeKey = scopedScopeKeyFromRawGroupIds(groupIdsCsv);
            boolean scopedRequested = scopedScopeKey != null;
            Record scopedRow = scopedRequested ? fetchScopedSyncState(scopedScopeKey) : null;
            // A single-group (scoped) read with no state row yet means the group has
            // never been refreshed: it is idle / not-started, NOT running, and must
            // not be driven by the global "pipelines" row (the scheduled full sync) or
            // it would look "syncing" mid-cycle.
            Record stateRow = scopedRow != null
                ? scopedRow
                : (scopedRequested ? null : fetchSyncState());

            boolean scopedMode = scopedRequested;
            // Only a single-group read carries a real start/completion pair from its
            // dedicated state row; the global "pipelines" readiness keeps its
            // historical "never mid-cycle" behavior.
            Instant lastStartedAt = (scopedMode && stateRow != null)
                ? toInstant(stateRow, "last_started_at") : null;
            Instant lastCompletedAt = stateRow != null ? toInstant(stateRow, "last_completed_at") : null;
            String lastError = stateRow != null ? toStr(stateRow, "last_error") : null;

            // Running = a start with no matching, newer completion: a first run has no
            // completion yet, and a re-trigger has a start newer than the last
            // completion. An abandoned run must not spin the caller forever, so a
            // start older than the stale bound is settled (idle), never "running".
            boolean inProgress = lastStartedAt != null
                && (lastCompletedAt == null || lastStartedAt.isAfter(lastCompletedAt))
                && !lastStartedAt.isBefore(Instant.now().minus(15, java.time.temporal.ChronoUnit.MINUTES));
            boolean syncing = scopedMode ? inProgress : false;
            Boolean scopedSyncing = scopedMode ? syncing : null;
            // A settled-but-failed scoped run still carries its last_error; expose it
            // (sanitized) so the caller stops and surfaces a real reason. A running or
            // idle-scoped run has no surfaced error.
            String scopedError = scopedMode && !syncing ? lastError : null;

            int projectCount = fetchPipedCount(groupIds);
            int pipelineCount = fetchPipedPipelineCount(groupIds);
            int runnerStateCount = fetchDistinctCount("analytics_runner_state",
                "group_id", buildGroupFilter(groupIds));
            Integer userCountObj;
            if (groupIds.length == 0) {
                userCountObj = fetchSingleInt(buildUserCountSql(groupIds));
            } else {
                java.util.List<Object> params = new java.util.ArrayList<>();
                prepareGroupParams(groupIds, params);
                userCountObj = fetchSingleInt(buildUserCountSql(groupIds), params.toArray());
            }
            int userCount = userCountObj != null ? userCountObj : 0;
            int userEventCount = fetchCount("analytics_user_events", buildGroupFilter(groupIds));
            int userIssueCount = fetchCount("analytics_user_issues", buildGroupFilter(groupIds));

            boolean ready = lastCompletedAt != null && lastError == null && !syncing;
            boolean hasData = projectCount > 0 || pipelineCount > 0
                || runnerStateCount > 0 || userCount > 0
                || userEventCount > 0 || userIssueCount > 0;

            String message = "";
            if (!ready) {
                if (syncing) {
                    // Still gathering — the caller keeps polling (bounded on the
                    // client). Do NOT emit "retrying"/"preparing": those words
                    // previously re-armed the frontend poll forever.
                    message = "Analytics data is being collected in the background…";
                } else if (lastError != null) {
                    // A finished-but-failed run. Settle (stop the spinner) and
                    // surface the reason: scoped callers read scopedError; the
                    // global path embeds a sanitized summary in the message.
                    ready = true;
                    if (scopedMode) {
                        message = "Pipeline refresh finished with issues.";
                    } else {
                        message = "Analytics data is incomplete: " + sanitize(lastError);
                    }
                }
            }

            return new AnalyticsReadiness(ready, hasData, message,
                lastCompletedAt, projectCount, pipelineCount,
                runnerStateCount, userCount,
                userEventCount, userIssueCount)
                .withScopedSync(scopedSyncing, sanitizeScopedError(scopedError));
        } catch (Exception e) {
            log.warn("Error getting analytics readiness: {}", e.getMessage());
            return new AnalyticsReadiness(false, false,
                "Error fetching analytics state: " + e.getMessage(),
                null, 0, 0, 0, 0, 0, 0);
        }
    }

    // ── Summary ────────────────────────────────────────────────

    public AnalyticsSummary getSummary(String groupIdsCsv, int hours, String pipelineView) {
        try {
            String[] groupIds = parseGroupIds(groupIdsCsv);
            if (!hasActivePool()) {
                return buildEmptySummary(hours);
            }

            long fromEpoch = System.currentTimeMillis() / 1000L - (long) hours * 3600;

            Map<String, Integer> statusCounts = fetchPipelineStatusCounts(fromEpoch,
                pipelineView, groupIds);

            int groupCount = fetchGroupCount(groupIds);
            int projectCount = fetchProjectInventoryCount(groupIds);
            int pipelineCount = statusCounts.values().stream().mapToInt(Integer::intValue).sum();
            int successCount = statusCounts.getOrDefault("success", 0);
            int failedCount = statusCounts.getOrDefault("failed", 0);
            int manualCount = statusCounts.getOrDefault("manual", 0);
            int activeCount = statusCounts.getOrDefault("running", 0);
            int canceledCount = statusCounts.getOrDefault("canceled", 0);

            List<AnalyticsHistoryPoint> history = buildHistory(fromEpoch, hours, groupIds);
            int[] runnerCounts = fetchRunnerTotals(groupIds);

            int completed = successCount + failedCount;
            double successRate = completed > 0
                ? Math.round(((double) successCount / completed) * 10000.0) / 100.0
                : 0.0;
            int windowDays = (hours + 23) / 24;

            return new AnalyticsSummary(
                windowDays, hours, groupCount, projectCount, pipelineCount,
                successCount, failedCount, manualCount, activeCount,
                canceledCount, runnerCounts[0], runnerCounts[1],
                runnerCounts[2], runnerCounts[3], runnerCounts[5],
                runnerCounts[4], history, successRate);
        } catch (Exception e) {
            log.warn("Error getting analytics summary: {}", e.getMessage());
            return buildEmptySummary(hours);
        }
    }

    // ── Users ──────────────────────────────────────────────────

    public List<UserActivity> getUsers(String groupIdsCsv, int hours) {
        try {
            String[] groupIds = parseGroupIds(groupIdsCsv);
            if (!hasActivePool()) {
                return Collections.emptyList();
            }

            long fromEpoch = System.currentTimeMillis() / 1000L - (long) hours * 3600;
            List<UserActivity> users = fetchUserBaselines(groupIds, fromEpoch);

            if (users.isEmpty()) {
                return Collections.emptyList();
            }

            for (String gid : groupIds) {
                enrichWithAllTimeLastActive(users, gid);
                enrichWithEvents(users, gid, fromEpoch, hours);
                enrichWithIssues(users, gid, fromEpoch, hours);
            }

            sortUsers(users);
            return users;
        } catch (Exception e) {
            log.warn("Error getting analytics users: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public PaginatedUserActivity getPageUsers(String groupIdsCsv, int hours,
                                               String activityAfter, String activityBefore,
                                               String membership, String userIds, String search,
                                               int page, int pageSize) {
        return getPageUsers(groupIdsCsv, hours, activityAfter, activityBefore, membership,
            userIds, search, page, pageSize, null, "asc");
    }

    public PaginatedUserActivity getPageUsers(String groupIdsCsv, int hours,
                                               String activityAfter, String activityBefore,
                                               String membership, String userIds, String search,
                                               int page, int pageSize, String sortBy, String sortOrder) {
        try {
            String[] groupIds = parseGroupIds(groupIdsCsv);
            if (!hasActivePool()) {
                return new PaginatedUserActivity(Collections.emptyList(), page, pageSize, 0);
            }

            List<UserActivity> allUsers = getAllUsers(groupIdsCsv, hours, activityAfter, activityBefore, membership, userIds, search);
            sortUsers(allUsers, sortBy, sortOrder);
            int total = allUsers.size();

            int fromIndex = (page - 1) * pageSize;
            if (fromIndex >= total) {
                return new PaginatedUserActivity(Collections.emptyList(), page, pageSize, total);
            }

            int toIndex = Math.min(fromIndex + pageSize, total);
            List<UserActivity> paged = allUsers.subList(fromIndex, toIndex);
            return new PaginatedUserActivity(paged, page, pageSize, total);
        } catch (Exception e) {
            log.warn("Error getting paginated users: {}", e.getMessage());
            return new PaginatedUserActivity(Collections.emptyList(), page, pageSize, 0);
        }
    }

    private void sortUsers(List<UserActivity> users, String sortBy, String sortOrder) {
        if (sortBy == null || sortBy.isBlank()) return;

        Comparator<UserActivity> comparator = switch (sortBy) {
            case "user" -> Comparator.comparing(
                user -> user.getName() == null || user.getName().isBlank() ? user.getUsername() : user.getName(),
                String.CASE_INSENSITIVE_ORDER);
            case "state" -> Comparator.comparing(UserActivity::getState,
                Comparator.nullsFirst(String.CASE_INSENSITIVE_ORDER));
            case "badge" -> Comparator.comparing(UserActivity::isCurrentMember);
            case "issues" -> Comparator.comparingLong(UserActivity::getIssueCount);
            case "mrs" -> Comparator.comparingLong(UserActivity::getMergeRequestCount);
            case "merged" -> Comparator.comparingLong(UserActivity::getMergedCount);
            case "pushes" -> Comparator.comparingLong(UserActivity::getPushCount);
            case "comments" -> Comparator.comparingLong(UserActivity::getCommentCount);
            case "last_active", "last_activity" -> Comparator.comparing(
                user -> {
                    String value = user.getLastPipelineActivity();
                    return value == null || value.isBlank() ? user.getLastActivityOn() : value;
                }, Comparator.nullsFirst(String.CASE_INSENSITIVE_ORDER));
            default -> null;
        };
        if (comparator == null) return;
        if ("desc".equalsIgnoreCase(sortOrder)) comparator = comparator.reversed();
        users.sort(comparator.thenComparingLong(UserActivity::getId));
    }

    public List<UserActivity> getAllUsers(String groupIdsCsv, int hours,
                                           String activityAfter, String activityBefore,
                                           String membership, String userIds, String search) {
        try {
            String[] groupIds = parseGroupIds(groupIdsCsv);
            if (!hasActivePool()) {
                return Collections.emptyList();
            }

            long fromEpoch = System.currentTimeMillis() / 1000L - (long) hours * 3600;
            List<UserActivity> users = fetchUserBaselines(groupIds, fromEpoch);

            if (users.isEmpty()) {
                return Collections.emptyList();
            }

            for (String gid : groupIds) {
                enrichWithAllTimeLastActive(users, gid);
                enrichWithEvents(users, gid, fromEpoch, hours);
                enrichWithIssues(users, gid, fromEpoch, hours);
            }

            // Apply activity_after / activity_before filters
            java.time.Instant afterFilter = parseInstant(activityAfter);
            java.time.Instant beforeFilter = parseInstant(activityBefore);
            if (afterFilter != null || beforeFilter != null) {
                users = users.stream()
                    .filter(u -> matchesTimeFilter(u, afterFilter, beforeFilter))
                    .collect(Collectors.toList());
            }

            // Apply membership filter
            if ("active".equals(membership)) {
                users = users.stream().filter(UserActivity::isCurrentMember).collect(Collectors.toList());
            } else if ("non-active".equals(membership)) {
                users = users.stream().filter(u -> !u.isCurrentMember()).collect(Collectors.toList());
            }

            // Apply user_ids filter (pipe-separated "id:id:id")
            if (userIds != null && !userIds.trim().isEmpty()) {
                String[] idArray = userIds.trim().split("\\|");
                java.util.Set<Long> allowedIds = new java.util.HashSet<>();
                for (String idStr : idArray) {
                    try {
                        allowedIds.add(Long.parseLong(idStr.trim()));
                    } catch (NumberFormatException ignored) {}
                }
                if (!allowedIds.isEmpty()) {
                    users = users.stream().filter(u -> allowedIds.contains(u.getId())).collect(Collectors.toList());
                }
            }

            // Apply search filter (username, name, id)
            if (search != null && !search.trim().isEmpty()) {
                String q = search.trim().toLowerCase();
                users = users.stream()
                    .filter(u -> u.getUsername().toLowerCase().contains(q)
                        || (u.getName() != null && u.getName().toLowerCase().contains(q))
                        || String.valueOf(u.getId()).contains(q))
                    .collect(Collectors.toList());
            }

            sortUsers(users);
            return users;
        } catch (Exception e) {
            log.warn("Error getting all users: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public UserMetrics getUserMetrics(String groupIdsCsv, int hours,
                                       String membership, String userIds, String search) {
        try {
            List<UserActivity> users = getAllUsers(groupIdsCsv, hours, null, null, membership, userIds, search);

            int activeUsers = 0;
            int nonActiveUsers = 0;
            int totalIssues = 0;
            int totalMergeRequests = 0;
            int totalMergedUsers = 0;
            int totalPushes = 0;
            int totalComments = 0;

            for (UserActivity u : users) {
                if (u.isCurrentMember()) activeUsers++;
                else nonActiveUsers++;
                totalIssues += u.getIssueCount();
                totalMergeRequests += u.getMergeRequestCount();
                totalPushes += u.getPushCount();
                totalComments += u.getCommentCount();
                if (u.getMergedCount() > 0) totalMergedUsers++;
            }

            return new UserMetrics(activeUsers, nonActiveUsers, users.size(),
                totalIssues, totalMergeRequests, totalMergedUsers,
                totalPushes, totalComments, false);
        } catch (Exception e) {
            log.warn("Error getting user metrics: {}", e.getMessage());
            return new UserMetrics(0, 0, 0, 0, 0, 0, 0, 0, false);
        }
    }

    public List<UserProjectRelation> getUserProjectRelations(String groupIdsCsv, String userIds) {
        try {
            String[] groupIds = parseGroupIds(groupIdsCsv);
            if (!hasActivePool()) {
                return Collections.emptyList();
            }

            List<String> groupFilters = new ArrayList<>();
            for (String gid : groupIds) {
                groupFilters.add("group_id = " + gid);
            }
            if (groupFilters.isEmpty()) groupFilters.add("1=1");

            String whereClause = String.join(" OR ", groupFilters);
            String whereClauseAnd = (groupIds.length > 0 ? " AND " + whereClause : "");

            // Build userId filter if provided
            String userIdFilter = "";
            if (userIds != null && !userIds.trim().isEmpty()) {
                String[] idArray = userIds.trim().split("\\|");
                List<String> idFilterParts = new ArrayList<>();
                for (String idStr : idArray) {
                    try {
                        idFilterParts.add("user_id = " + Long.parseLong(idStr.trim()));
                    } catch (NumberFormatException ignored) {}
                }
                if (!idFilterParts.isEmpty()) {
                    userIdFilter = " AND (" + String.join(" OR ", idFilterParts) + ")";
                }
            }

            // From analytics_user_project_relations
            String sql = "SELECT user_id, project_id, group_id, synced_at FROM analytics_user_project_relations WHERE " + whereClause + userIdFilter + " ORDER BY user_id, project_id";

            List<UserProjectRelation> result = new ArrayList<>();
            for (var row : jdbcTemplate.queryForList(sql)) {
                UserProjectRelation rel = new UserProjectRelation();
                rel.setUserId(((Number) row.get("user_id")).longValue());
                rel.setProjectId(((Number) row.get("project_id")).longValue());
                rel.setGroupId(((Number) row.get("group_id")).longValue());
                Object synced = row.get("synced_at");
                if (synced instanceof java.sql.Timestamp t) rel.setSyncedAt(t.toInstant());
                else if (synced instanceof java.time.Instant i) rel.setSyncedAt(i);
                else if (synced != null && synced.toString().length() > 0) rel.setSyncedAt(Instant.parse(synced.toString()));
                result.add(rel);
            }
            return result;
        } catch (Exception e) {
            log.warn("Error getting user-project relations: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    // ── User internals ─────────────────────────────────────────

    private List<UserActivity> fetchUserBaselines(String[] groupIds, long fromEpoch) {
        List<UserActivity> result = new ArrayList<>();

        for (String gid : groupIds) {
            try {
                String sql = "SELECT au.gitlab_id AS id, au.username, au.name, "
                    + "au.avatar_url, au.web_url, au.state, au.is_admin, "
                    + "au.is_current_member, au.last_activity_on, "
                    + "COALESCE(ua.g, 0) AS pipeline_count, "
                    + "COALESCE(ua.p, 0) AS project_count, "
                    + "ua.lpa AS last_pipeline_activity "
                    + "FROM analytics_users au "
                    + "LEFT JOIN ("
                    + "  SELECT ap.author_id, COUNT(*) AS g, "
                    + "    COUNT(DISTINCT ap.project_id) AS p, "
                    + "    MAX(ap.updated_at) AS lpa "
                    + "  FROM analytics_pipelines ap "
                    + "  JOIN analytics_projects pp ON ap.project_id = pp.gitlab_id "
                    + "  WHERE pp.group_id = " + gid
                    + "    AND ap.updated_at >= to_timestamp(" + fromEpoch + ") "
                    + "  GROUP BY ap.author_id "
                    + ") ua ON au.gitlab_id = ua.author_id "
                    + "WHERE au.group_id = " + gid
                    + " ORDER BY pipeline_count DESC, project_count DESC";

                jdbcTemplate.query(sql, (rs, rw) -> {
                    UserActivity u = new UserActivity();
                    u.setId(rs.getLong("id"));
                    u.setUsername(rs.getString("username"));
                    u.setName(rs.getString("name"));
                    u.setAvatarUrl(rs.getString("avatar_url"));
                    u.setWebUrl(rs.getString("web_url"));
                    u.setState(rs.getString("state"));
                    u.setIsAdmin(rs.getBoolean("is_admin"));
                    u.setIsCurrentMember(rs.getBoolean("is_current_member"));
                    u.setLastActivityOn(rs.getString("last_activity_on"));
                    Object lpaObj = rs.getObject("last_pipeline_activity");
                    String lastPipelineActivity = null;
                    if (lpaObj != null) {
                        if (lpaObj instanceof java.sql.Timestamp t) {
                            lastPipelineActivity = t.toInstant().toString();
                        } else if (lpaObj instanceof Instant i) {
                            lastPipelineActivity = i.toString();
                        } else {
                            lastPipelineActivity = lpaObj.toString();
                        }
                    }
                    u.setLastPipelineActivity(lastPipelineActivity);
                    result.add(u);
                    return u;
                });
            } catch (Exception e) {
                log.debug("Error fetching user baselines for group {}: {}", gid, e.getMessage());
            }
        }

        return result;
    }

    // ── Pipelines ──────────────────────────────────────────────

    public PaginatedPipelineResponse getProjectPipelines(String groupIdCsv, String projectIdsCsv, int hours,
                                                          String statusCsv, String topicsJson,
                                                          String pipelineView, int page, int pageSize) {
        try {
            String[] groupIds = parseGroupIds(groupIdCsv);
            if (groupIds.length == 0) {
                groupIds = new String[0];
            }
            if (!hasActivePool()) {
                return new PaginatedPipelineResponse(0, page, pageSize, groupIdCsv, Collections.emptyList());
            }

            List<Long> projectFilter = null;
            if (projectIdsCsv != null && !projectIdsCsv.trim().isEmpty()) {
                projectFilter = Arrays.stream(projectIdsCsv.split(","))
                    .map(String::trim)
                    .map(Long::valueOf)
                    .collect(Collectors.toList());
            }

            String[] statusFilter = null;
            if (statusCsv != null && !statusCsv.trim().isEmpty()) {
                statusFilter = statusCsv.split(",");
            }

            List<String> topicFilter = parseTopics(topicsJson);

            if ("latest".equals(pipelineView)) {
                return fetchGroupsWithPipelinesPaginated(groupIds, projectFilter, hours, statusFilter, topicFilter, true, page, pageSize);
            } else {
                return fetchGroupsWithPipelinesPaginated(groupIds, projectFilter, hours, statusFilter, topicFilter, false, page, pageSize);
            }
        } catch (Exception e) {
            log.debug("Error fetching project pipelines: {}", e.getMessage());
            return new PaginatedPipelineResponse(0, page, pageSize, groupIdCsv, Collections.emptyList());
        }
    }

    private PaginatedPipelineResponse fetchGroupsWithPipelinesPaginated(String[] groupIds,
                                                                         List<Long> projectFilter,
                                                                         int hours,
                                                                         String[] statusFilter,
                                                                         List<String> topicFilter,
                                                                         boolean latestOnly,
                                                                         int page,
                                                                         int pageSize) {
        try {
            // Count query first
            int totalCount = fetchProjectsCount(groupIds, projectFilter, topicFilter, hours);

            // Paginated projects query
            int offset = (page - 1) * pageSize;
            Map<Long, Map<String, Object>> projectMap = fetchProjectsPaginated(groupIds, projectFilter, topicFilter, pageSize, offset, hours);

            if (projectMap.isEmpty()) {
                return new PaginatedPipelineResponse(totalCount, page, pageSize, null, Collections.emptyList());
            }

            List<Long> projectIds = new ArrayList<>(projectMap.keySet());
            List<String> pidList = new ArrayList<>();
            for (Long pid : projectIds) {
                pidList.add(pid.toString());
            }

            // Build pipelines query with optional status filter and deduplication
            StringBuilder pipelinesSql = new StringBuilder(
                "SELECT gitlab_id, project_id, iid, sha, branch, "
                + "status, source, coverage, created_at, updated_at, web_url "
                + "FROM analytics_pipelines "
                + "WHERE project_id IN (" + String.join(",", pidList) + ") "
                + "AND updated_at >= NOW() - make_interval(hours => " + hours + ")");

            if (statusFilter != null && statusFilter.length > 0) {
                pipelinesSql.append(" AND LOWER(status) IN (");
                for (int i = 0; i < statusFilter.length; i++) {
                    if (i > 0) pipelinesSql.append(",");
                    pipelinesSql.append("?");
                }
                pipelinesSql.append(")");
            }

            pipelinesSql.append(" ORDER BY project_id, updated_at DESC");

            Map<Long, List<Map<String, Object>>> pipelineMap = new LinkedHashMap<>();
            Object[] pipelineArgs = new Object[statusFilter != null ? statusFilter.length : 0];
            if (statusFilter != null) {
                for (int i = 0; i < statusFilter.length; i++) {
                    pipelineArgs[i] = statusFilter[i].toLowerCase();
                }
            }

            try {
                var result = dsl.fetch(pipelinesSql.toString(), pipelineArgs);
                for (org.jooq.Record r : result) {
                    Long projectId = r.getValue("project_id", Long.class);
                    pipelineMap.computeIfAbsent(projectId, k -> new ArrayList<>()).add(convertMap(r));
                }
            } catch (Exception e) {
                log.debug("Error fetching pipelines: {}", e.getMessage());
            }

            List<ProjectPipeline> resultProjects = new ArrayList<>();
            List<Map<String, Object>> projectsOrdered = new ArrayList<>(projectMap.values());
            projectsOrdered.sort((a, b) -> {
                String na = ((String) a.getOrDefault("name", "")).toLowerCase();
                String nb = ((String) b.getOrDefault("name", "")).toLowerCase();
                return na.compareTo(nb);
            });

            for (Map<String, Object> proj : projectsOrdered) {
                Long gitlabId = ((Number) proj.get("gitlab_id")).longValue();
                Long groupIdVal = ((Number) proj.get("group_id")).longValue();

                // Deduplicate pipelines if latestOnly
                Map<String, Map<String, Object>> latestByRef = new LinkedHashMap<>();
                List<Map<String, Object>> pipelineRows = pipelineMap.getOrDefault(gitlabId, Collections.emptyList());
                for (Map<String, Object> pr : pipelineRows) {
                    String ref = (String) pr.get("branch");
                    if (latestOnly) {
                        // Keep only the most recent pipeline per ref
                        Map<String, Object> existing = latestByRef.get(ref);
                        if (existing == null) {
                            latestByRef.put(ref, pr);
                        } else {
                            Object existingTs = existing.get("updated_at");
                            Object currentTs = pr.get("updated_at");
                            boolean replace = false;
                            if (currentTs instanceof Timestamp ct && existingTs instanceof Timestamp et) {
                                replace = ct.after(et);
                            } else if (currentTs instanceof java.time.Instant ci && existingTs instanceof java.time.Instant ei) {
                                replace = ci.isAfter(ei);
                            } else if (currentTs instanceof java.time.Instant ci && existingTs instanceof Timestamp et) {
                                replace = ci.isAfter(et.toInstant());
                            } else if (currentTs instanceof Timestamp ct && existingTs instanceof java.time.Instant ei) {
                                replace = ct.toInstant().isAfter(ei);
                            }
                            if (replace) latestByRef.put(ref, pr);
                        }
                    } else {
                        latestByRef.put(ref + "_" + pr.getOrDefault("gitlab_id", ""), pr);
                    }
                }

                String name = (String) proj.get("name");
                String path = (String) proj.get("path");
                String webUrl = (String) proj.get("web_url");
                String defaultBranch = (String) proj.get("default_branch");
                Object topicsObj = proj.get("topics");
                List<String> topicList = new ArrayList<>();
                if (topicsObj != null) {
                    String topicsClassName = topicsObj.getClass().getName();
                    String topicsValue;
                    if (topicsObj instanceof String s) {
                        topicsValue = s;
                    } else if (topicsClassName.startsWith("org.jooq.JSONB")) {
                        topicsValue = String.valueOf(topicsObj);
                    } else if (topicsClassName.equals("org.postgresql.util.PGobject")) {
                        try {
                            topicsValue = (String) topicsObj.getClass().getMethod("getValue").invoke(topicsObj);
                        } catch (Exception e) {
                            topicsValue = null;
                        }
                    } else if (topicsObj instanceof List<?> list) {
                        for (Object item : list) {
                            if (item instanceof String s) topicList.add(s);
                        }
                        topicsValue = null;
                    } else {
                        log.debug("Unhandled topics type: {}", topicsClassName);
                        topicsValue = null;
                    }
                    if (topicsValue != null && !topicsValue.isEmpty() && !topicsValue.equals("[]")) {
                        try {
                            JsonNode node = objectMapper.readTree(topicsValue);
                            if (node.isArray()) {
                                for (JsonNode item : node) {
                                    if (item.isTextual()) topicList.add(item.asText());
                                }
                            }
                        } catch (Exception ignored) {}
                    }
                }
                String namespacePath = (String) proj.get("namespace_path");
                boolean jobsEnabled = ((Boolean) proj.get("jobs_enabled"));

                ProjectPipeline.ProjectData.NamespaceData ns =
                    new ProjectPipeline.ProjectData.NamespaceData(
                        0, namespacePath, namespacePath, namespacePath);

                ProjectPipeline.ProjectData projectData = new ProjectPipeline.ProjectData();
                projectData.setId(gitlabId);
                projectData.setName(name);
                projectData.setPath(path);
                projectData.setWebUrl(webUrl);
                projectData.setDefaultBranch(defaultBranch);
                projectData.setTopics(topicList);
                projectData.setNamespace(ns);
                projectData.setJobsEnabled(jobsEnabled);

                List<ProjectPipeline.PipelineDTO> pipelines = new ArrayList<>();
                for (Map<String, Object> pr : latestByRef.values()) {
                    ProjectPipeline.PipelineDTO p = new ProjectPipeline.PipelineDTO();
                    p.setId(((Number) pr.get("gitlab_id")).longValue());
                    p.setIid(((Number) pr.get("iid")).longValue());
                    p.setProjectId(((Number) pr.get("project_id")).longValue());
                    p.setCoverage(pr.get("coverage"));
                    p.setSha((String) pr.get("sha"));
                    p.setRef((String) pr.get("branch"));
                    p.setStatus((String) pr.get("status"));
                    p.setSource((String) pr.get("source"));

                    Object createdAt = pr.get("created_at");
                    if (createdAt instanceof Timestamp t) p.setCreatedAt(t.toInstant().toString());
                    else if (createdAt instanceof java.time.Instant i) p.setCreatedAt(i.toString());
                    else if (createdAt != null) p.setCreatedAt(createdAt.toString());

                    Object updatedAt = pr.get("updated_at");
                    if (updatedAt instanceof Timestamp t) p.setUpdatedAt(t.toInstant().toString());
                    else if (updatedAt instanceof java.time.Instant i) p.setUpdatedAt(i.toString());
                    else if (updatedAt != null) p.setUpdatedAt(updatedAt.toString());

                    p.setWebUrl((String) pr.get("web_url"));
                    pipelines.add(p);
                }

                ProjectPipeline pp = new ProjectPipeline(groupIdVal, projectData, pipelines);
                resultProjects.add(pp);
            }

            return new PaginatedPipelineResponse(totalCount, page, pageSize, null, resultProjects);
        } catch (Exception e) {
            log.debug("Error fetching paginated group pipelines: {}", e.getMessage());
            return new PaginatedPipelineResponse(0, page, pageSize, null, Collections.emptyList());
        }
    }

    private List<ProjectPipeline> fetchGroupsWithPipelines(String[] groupIds,
                                                           List<Long> projectFilter,
                                                           long fromEpoch,
                                                           int hours) {
        List<ProjectPipeline> result = new ArrayList<>();

        try {
            StringBuilder pidsClause = new StringBuilder();
            for (int i = 0; i < groupIds.length; i++) {
                if (i > 0) pidsClause.append(",");
                pidsClause.append(groupIds[i]);
            }

            String projectsSql = "SELECT gitlab_id, group_id, name, path, web_url, "
                + "default_branch, topics, jobs_enabled, namespace_path "
                + "FROM analytics_projects "
                + "WHERE group_id IN (" + pidsClause + ")";

            if (projectFilter != null && !projectFilter.isEmpty()) {
                List<String> pf = new ArrayList<>();
                for (Long pid : projectFilter) {
                    pf.add(pid.toString());
                }
                projectsSql += " AND gitlab_id IN (" + String.join(",", pf) + ")";
            }

            Map<Long, Map<String, Object>> projectMap = new LinkedHashMap<>();
            for (Map<String, Object> row : jdbcTemplate.queryForList(projectsSql)) {
                Long gitlabId = ((Number) row.get("gitlab_id")).longValue();
                projectMap.put(gitlabId, row);
            }

            if (projectMap.isEmpty()) {
                return result;
            }

            List<Long> projectIds = new ArrayList<>(projectMap.keySet());
            List<String> pidList = new ArrayList<>();
            for (Long pid : projectIds) {
                pidList.add(pid.toString());
            }

            String pipelinesSql = "SELECT gitlab_id, project_id, iid, sha, branch, "
                + "status, source, coverage, created_at, updated_at, web_url "
                + "FROM analytics_pipelines "
                + "WHERE project_id IN (" + String.join(",", pidList) + ") "
                + "AND updated_at >= NOW() - make_interval(hours => " + hours + ") "
                + "ORDER BY project_id, updated_at DESC";

            Map<Long, List<Map<String, Object>>> pipelineMap = new LinkedHashMap<>();
            for (Map<String, Object> row : jdbcTemplate.queryForList(pipelinesSql)) {
                Long projectId = ((Number) row.get("project_id")).longValue();
                pipelineMap.computeIfAbsent(projectId, k -> new ArrayList<>()).add(row);
            }

            List<Map<String, Object>> projectsOrdered = new ArrayList<>(projectMap.values());
            projectsOrdered.sort((a, b) -> {
                String na = ((String) a.get("name")).toLowerCase();
                String nb = ((String) b.get("name")).toLowerCase();
                return na.compareTo(nb);
            });

            for (Map<String, Object> proj : projectsOrdered) {
                Long gitlabId = ((Number) proj.get("gitlab_id")).longValue();
                Long groupId = ((Number) proj.get("group_id")).longValue();
                String name = (String) proj.get("name");
                 String path = (String) proj.get("path");
                 String webUrl = (String) proj.get("web_url");
                 String defaultBranch = (String) proj.get("default_branch");
                 Object topicsObj = proj.get("topics");
                 List<String> topicList = new ArrayList<>();
                 if (topicsObj != null) {
                     String topicsClassName = topicsObj.getClass().getName();
                     String topicsValue;
                     if (topicsObj instanceof String s) {
                         topicsValue = s;
                     } else if (topicsClassName.startsWith("org.jooq.JSONB")) {
                         topicsValue = String.valueOf(topicsObj);
                     } else if (topicsClassName.equals("org.postgresql.util.PGobject")) {
                         try {
                             topicsValue = (String) topicsObj.getClass().getMethod("getValue").invoke(topicsObj);
                         } catch (Exception e) {
                             topicsValue = null;
                         }
                     } else if (topicsObj instanceof List<?> list) {
                         for (Object item : list) {
                             if (item instanceof String s) topicList.add(s);
                         }
                         topicsValue = null;
                     } else {
                         log.debug("Unhandled topics type: {}", topicsClassName);
                         topicsValue = null;
                     }
                     if (topicsValue != null && !topicsValue.isEmpty() && !topicsValue.equals("[]")) {
                         try {
                             JsonNode node = objectMapper.readTree(topicsValue);
                             if (node.isArray()) {
                                 for (JsonNode item : node) {
                                     if (item.isTextual()) topicList.add(item.asText());
                                 }
                             }
                         } catch (Exception ignored) {}
                     }
                 }
                 String namespacePath = (String) proj.get("namespace_path");
                boolean jobsEnabled = ((Boolean) proj.get("jobs_enabled"));

                ProjectPipeline.ProjectData.NamespaceData ns =
                    new ProjectPipeline.ProjectData.NamespaceData(
                        0, namespacePath, namespacePath, namespacePath);

                ProjectPipeline.ProjectData projectData = new ProjectPipeline.ProjectData();
                projectData.setId(gitlabId);
                projectData.setName(name);
                projectData.setPath(path);
                projectData.setWebUrl(webUrl);
                projectData.setDefaultBranch(defaultBranch);
                projectData.setTopics(topicList);
                projectData.setNamespace(ns);
                projectData.setJobsEnabled(jobsEnabled);

                List<ProjectPipeline.PipelineDTO> pipelines = new ArrayList<>();
                List<Map<String, Object>> pipelineRows = pipelineMap.getOrDefault(gitlabId, Collections.emptyList());
                for (Map<String, Object> pr : pipelineRows) {
                    ProjectPipeline.PipelineDTO p = new ProjectPipeline.PipelineDTO();
                    p.setId(((Number) pr.get("gitlab_id")).longValue());
                    p.setIid(((Number) pr.get("iid")).longValue());
                    p.setProjectId(((Number) pr.get("project_id")).longValue());
                    p.setCoverage(pr.get("coverage"));
                    p.setSha((String) pr.get("sha"));
                    p.setRef((String) pr.get("branch"));
                    p.setStatus((String) pr.get("status"));
                    p.setSource((String) pr.get("source"));
                    Object createdAt = pr.get("created_at");
                    if (createdAt instanceof Timestamp t) {
                        p.setCreatedAt(t.toInstant().toString());
                    } else if (createdAt instanceof java.time.Instant i) {
                        p.setCreatedAt(i.toString());
                    } else if (createdAt != null) {
                        p.setCreatedAt(createdAt.toString());
                    }
                    Object updatedAt = pr.get("updated_at");
                    if (updatedAt instanceof Timestamp t) {
                        p.setUpdatedAt(t.toInstant().toString());
                    } else if (updatedAt instanceof java.time.Instant i) {
                        p.setUpdatedAt(i.toString());
                    } else if (updatedAt != null) {
                        p.setUpdatedAt(updatedAt.toString());
                    }
                    p.setWebUrl((String) pr.get("web_url"));
                    pipelines.add(p);
                }

                ProjectPipeline pp = new ProjectPipeline(groupId, projectData, pipelines);
                result.add(pp);
            }
        } catch (Exception e) {
            log.debug("Error fetching group pipelines: {}", e.getMessage());
        }

        return result;
    }

    // ── Pagination helpers ─────────────────────────────────────

    private List<String> parseTopics(String topicsJson) {
        if (topicsJson == null || topicsJson.trim().isEmpty()) {
            return Collections.emptyList();
        }
        try {
            JsonNode node = objectMapper.readTree(topicsJson);
            List<String> topics = new ArrayList<>();
            if (node.isArray()) {
                for (JsonNode item : node) {
                    if (item.isTextual()) topics.add(item.asText());
                }
            }
            return topics;
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private Map<Long, Map<String, Object>> fetchProjectsPaginated(String[] groupIds,
                                                                      List<Long> projectFilter,
                                                                      List<String> topicFilter,
                                                                      int limit,
                                                                      int offset,
                                                                      int hours) {
        Map<Long, Map<String, Object>> projectMap = new LinkedHashMap<>();

        try {
            List<String> groupWhere = new ArrayList<>();
            for (String gid : groupIds) {
                groupWhere.add("group_id = ?");
            }
            String groupFilter = String.join(" OR ", groupWhere);
            if (groupFilter.isEmpty()) {
                groupFilter = "1=1";
            }

            String timeInterval = "make_interval(hours => " + hours + ")";

            StringBuilder sql = new StringBuilder(
                "SELECT gitlab_id, group_id, name, path, web_url, "
                + "default_branch, topics, jobs_enabled, namespace_path, "
                + "(SELECT COUNT(DISTINCT p2.project_id) FROM analytics_pipelines p2 "
                + "  JOIN analytics_projects pr2 ON p2.project_id = pr2.gitlab_id "
                + "  WHERE pr2.gitlab_id = p1.gitlab_id "
                + "  AND p2.updated_at >= NOW() - " + timeInterval + ") AS has_pipelines "
                + "FROM analytics_projects p1 "
                + "WHERE " + groupFilter
            );

            List<Object> params = new ArrayList<>();
            for (String gid : groupIds) {
                params.add(Long.parseLong(gid));
            }

            if (projectFilter != null && !projectFilter.isEmpty()) {
                sql.append(" AND p1.gitlab_id IN (");
                for (int i = 0; i < projectFilter.size(); i++) {
                    if (i > 0) sql.append(",");
                    sql.append("?");
                    params.add(projectFilter.get(i));
                }
                sql.append(")");
            }

            sql.append(" AND p1.gitlab_id IN (");
            sql.append("  SELECT DISTINCT p2.project_id FROM analytics_pipelines p2 "
                + " WHERE p2.updated_at >= NOW() - " + timeInterval + ")");

             if (topicFilter != null && !topicFilter.isEmpty()) {
                // Build a JSON array from topic filter and use JSONB containment
                String topicsJson = "[" + String.join(",", topicFilter.stream().map(t -> "\"" + t.replace("\"", "\\\"") + "\"").toArray(String[]::new)) + "]";
                sql.append(" AND p1.topics @> ?::jsonb");
                params.add(topicsJson);
            }

            sql.append(" ORDER BY LOWER(p1.name)");

            sql.append(" LIMIT ?");
            params.add(limit);
            sql.append(" OFFSET ?");
            params.add(offset);

            var result = dsl.fetch(sql.toString(), params.toArray());
            for (org.jooq.Record r : result) {
                try {
                    Long gitlabId = r.getValue("gitlab_id", Long.class);
                    projectMap.put(gitlabId, convertMap(r));
                } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            log.debug("Error building projects pagination query: {}", e.getMessage());
        }

        return projectMap;
    }

    private int fetchProjectsCount(String[] groupIds, List<Long> projectFilter, List<String> topicFilter, int hours) {
        try {
            List<String> groupWhere = new ArrayList<>();
            for (String gid : groupIds) {
                groupWhere.add("group_id = ?");
            }
            String groupFilter = String.join(" OR ", groupWhere);
            if (groupFilter.isEmpty()) {
                groupFilter = "1=1";
            }

            String timeInterval = "make_interval(hours => " + hours + ")";

            StringBuilder sql = new StringBuilder(
                "SELECT COUNT(DISTINCT p1.gitlab_id) "
                + "FROM analytics_projects p1 "
                + "WHERE " + groupFilter
            );

            List<Object> params = new ArrayList<>();
            for (String gid : groupIds) {
                params.add(Long.parseLong(gid));
            }

            if (projectFilter != null && !projectFilter.isEmpty()) {
                sql.append(" AND p1.gitlab_id IN (");
                for (int i = 0; i < projectFilter.size(); i++) {
                    if (i > 0) sql.append(",");
                    sql.append("?");
                    params.add(projectFilter.get(i));
                }
                sql.append(")");
            }

            sql.append(" AND p1.gitlab_id IN (");
            sql.append("  SELECT DISTINCT p2.project_id FROM analytics_pipelines p2 "
                + " WHERE p2.updated_at >= NOW() - " + timeInterval + ")");

             if (topicFilter != null && !topicFilter.isEmpty()) {
                String topicsJson = "[" + String.join(",", topicFilter.stream().map(t -> "\"" + t.replace("\"", "\\\"") + "\"").toArray(String[]::new)) + "]";
                sql.append(" AND p1.topics @> ?::jsonb");
                params.add(topicsJson);
            }

            return fetchSingleInt(sql.toString(), params.toArray());
        } catch (Exception e) {
            log.debug("Error fetching projects count: {}", e.getMessage());
            return 0;
        }
    }

    private Map<String, Object> convertMap(org.jooq.Record r) {
        Map<String, Object> map = new HashMap<>();
        for (org.jooq.Field<?> field : r.fields()) {
            map.put(field.getName(), r.get(field));
        }
        return map;
    }

    // ── Readiness internals ────────────────────────────────────

    private boolean hasActivePool() {
        try {
            List<String> rows = jdbcTemplate.queryForList(
                "SELECT 1 FROM gitlab_environments WHERE enabled = TRUE LIMIT 1", String.class);
            return !rows.isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    private Record fetchSyncState() {
        try {
            Result<Record> r = dsl.fetch(
                "SELECT last_started_at, last_completed_at, last_error "
                + "FROM analytics_sync_state WHERE scope = 'pipelines'");
            return (r != null && !r.isEmpty()) ? r.get(0) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** Read a scoped-refresh sync state row by its "refresh:{ns}:{native}" key. */
    private Record fetchScopedSyncState(String scopeKey) {
        try {
            Result<Record> r = dsl.fetch(
                "SELECT last_started_at, last_completed_at, last_error "
                + "FROM analytics_sync_state WHERE scope = ?::text", scopeKey);
            return (r != null && !r.isEmpty()) ? r.get(0) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Build the scoped-refresh sync-state key for a single-group readiness call.
     * The key must match the one written by {@code AnalyticsSyncService.refreshScope}
     * (namespace + native group id). We recover the full (federated) token from
     * the caller's raw CSV so the namespace is always available — a missing row
     * simply means no scoped refresh has run for this group yet.
     */
    private String scopedScopeKeyFromRawGroupIds(String groupIdsCsv) {
        if (groupIdsCsv == null || groupIdsCsv.trim().isEmpty()) return null;
        String[] rawTokens = groupIdsCsv.split(",");
        if (rawTokens.length != 1) return null;
        String token = rawTokens[0].trim();
        long federated;
        try {
            federated = Long.parseLong(token);
        } catch (NumberFormatException e) {
            return null;
        }
        com.gitlabops.util.FederatedIdUtility.DecodedId parts =
            com.gitlabops.util.FederatedIdUtility.DecodedId.from(federated);
        if (parts.localId() <= 0) return null;
        return com.gitlabops.service.AnalyticsSyncStorage.scopedRefreshScope(
            parts.namespaceId(), parts.localId());
    }

    /** Trim + redact secret-looking tokens; cap length so a huge stack trace never
     *  leaks out of readiness. */
    private String sanitize(String s) {
        if (s == null) return null;
        String redacted = s.replaceAll("(?-i)(PRIVATE-TOKEN:\\s*)[A-Za-z0-9_-]+", "$1[REDACTED]")
                          .replaceAll("(?-i)(Bearer\\s+)[A-Za-z0-9._-]+", "$1[REDACTED]");
        redacted = redacted.replaceAll("\\s+", " ").trim();
        return redacted.length() > 200 ? redacted.substring(0, 200) + "…" : redacted;
    }

    private String sanitizeScopedError(String s) {
        if (s == null) return null;
        String out = sanitize(s);
        return out == null || out.isEmpty() ? null : out;
    }

    @SuppressWarnings("unchecked")
    private int[] fetchRunnerTotals(String[] groupIds) {
        int[] counts = {0, 0, 0, 0, 0, 0, 0}; // total, running, idle, offline, paused, stale, online

        try {
            List<String> payloads;
            if (groupIds.length == 0) {
                payloads = jdbcTemplate.queryForList(
                    "SELECT payload::text FROM analytics_runner_state", String.class);
            } else {
                payloads = new ArrayList<>();
                for (String gid : groupIds) {
                    try {
                        String s = jdbcTemplate.queryForObject(
                            "SELECT payload::text FROM analytics_runner_state WHERE group_id = " + gid, String.class);
                        if (s != null) payloads.add(s);
                    } catch (Exception ignored) {}
                }
            }

            for (String payload : payloads) {
                if (payload == null || payload.trim().isEmpty()) continue;

                JsonNode nodes = objectMapper.readTree(payload);
                if (!nodes.isArray()) continue;

                for (JsonNode item : nodes) {
                    counts[0]++;
                    JsonNode runner = item.has("runner") ? item.path("runner") : item;
                    if (!runner.isObject()) continue;

                    boolean paused = runner.path("paused").asBoolean(false);
                    String jobStatus = runner.path("job_execution_status").asText("");
                    boolean online = runner.path("online").asBoolean(false);
                    String contactedAt = runner.path("contacted_at").asText("");

                    String runnerStatus;
                    if (paused) {
                        runnerStatus = "paused";
                    } else if ("running".equals(jobStatus) || "active".equals(jobStatus)) {
                        runnerStatus = "running";
                    } else if (online && "idle".equals(jobStatus)) {
                        runnerStatus = "idle";
                    } else if (online && !contactedAt.isEmpty()) {
                        try {
                            var lastContacted = Instant.parse(contactedAt);
                            if (lastContacted.isBefore(Instant.now().minusSeconds(1800))) {
                                runnerStatus = "stale";
                            } else {
                                runnerStatus = "online";
                            }
                        } catch (Exception e) {
                            runnerStatus = "online";
                        }
                    } else if (online) {
                        runnerStatus = "online";
                    } else {
                        runnerStatus = "offline";
                    }

                    if ("running".equals(runnerStatus)) {
                        counts[1]++;
                    } else if ("idle".equals(runnerStatus)) {
                        counts[2]++;
                    } else if ("offline".equals(runnerStatus)) {
                        counts[3]++;
                    } else if ("paused".equals(runnerStatus)) {
                        counts[4]++;
                    } else if ("stale".equals(runnerStatus)) {
                        counts[5]++;
                    } else {
                        counts[6]++;
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Error fetching runner totals: {}", e.getMessage());
        }

        return counts;
    }

    // ── Summary internals ──────────────────────────────────────

    private Map<String, Integer> fetchPipelineStatusCounts(
            long fromEpoch, String pipelineView, String[] groupIds) {

        Map<String, Integer> m = new HashMap<>();
        m.put("success", 0); m.put("failed", 0); m.put("manual", 0);
        m.put("running", 0); m.put("canceled", 0);

        try {
            String where = " AND ap.updated_at >= to_timestamp('" + fromEpoch + "')";
            if (groupIds.length > 0) {
                where += " AND ap.project_id IN (SELECT gitlab_id FROM analytics_projects WHERE group_id IN ("
                    + groupList(groupIds) + "))";
            }

            String viewOpt = "";
            if ("latest".equals(pipelineView)) {
                viewOpt = "AND ROW(ap.project_id, ap.branch) IN ("
                    + "SELECT project_id, branch FROM analytics_pipelines "
                    + "WHERE updated_at >= to_timestamp('" + fromEpoch + "')";
                if (groupIds.length > 0) {
                    viewOpt += " AND project_id IN (SELECT gitlab_id FROM analytics_projects WHERE group_id IN (" + groupList(groupIds) + "))";
                }
                viewOpt += " ORDER BY updated_at DESC )";
            }

            String sql = "SELECT LOWER(ap.status::text) AS status, COUNT(*)::int AS cnt "
                + "FROM analytics_pipelines ap WHERE 1=1 "
                + where + viewOpt
                + " GROUP BY ap.status";

            for (Map<String, Object> row : jdbcTemplate.queryForList(sql)) {
                String st = String.valueOf(row.get("status"));
                int cnt = ((Number) row.get("cnt")).intValue();
                switch (st) {
                    case "success": m.put("success", cnt); break;
                    case "failed": m.put("failed", cnt); break;
                    case "manual": m.put("manual", cnt); break;
                    case "running": m.put("running", cnt); break;
                    case "canceled": m.put("canceled", cnt); break;
                    default: m.put(st, cnt); break;
                }
            }
        } catch (Exception e) {
            log.debug("Error fetching pipeline status counts: {}", e.getMessage());
        }

        return m;
    }

    private int fetchGroupCount(String[] groupIds) {
        try {
            String sql;
            if (groupIds.length == 0) {
                sql = "SELECT COUNT(DISTINCT namespace_path)::int FROM analytics_projects "
                    + "WHERE namespace_path IS NOT NULL AND namespace_path != ''";
            } else {
                sql = "SELECT COUNT(DISTINCT namespace_path)::int FROM analytics_projects "
                    + "WHERE group_id IN (" + groupList(groupIds) + ") "
                    + "AND namespace_path IS NOT NULL AND namespace_path != ''";
            }
            return fetchSingleInt(sql);
        } catch (Exception e) {
            return 0;
        }
    }

    private int fetchProjectInventoryCount(String[] groupIds) {
        try {
            String base = "SELECT COUNT(DISTINCT gitlab_id) FROM analytics_projects WHERE 1=1";
            if (groupIds.length > 0) {
                base += " AND group_id IN (" + groupList(groupIds) + ")";
            }
            return fetchSingleInt(base);
        } catch (Exception e) {
            return 0;
        }
    }

    private List<AnalyticsHistoryPoint> buildHistory(long fromEpoch, int hours, String[] groupIds) {
        List<AnalyticsHistoryPoint> result = new ArrayList<>();
        int bucketHours = hours <= 12 ? 1 : hours <= 72 ? 6 : 24;

        try {
            StringBuilder idsClause = new StringBuilder();
            for (int i = 0; i < groupIds.length; i++) {
                if (i > 0) idsClause.append(",");
                idsClause.append(groupIds[i]);
            }

            String where = "";
            if (groupIds.length > 0) {
                where = "LEFT JOIN analytics_projects p ON ap.project_id = p.gitlab_id "
                    + "WHERE p.group_id IN (" + idsClause + ")";
            }

            String query = "WITH buckets AS ("
                + "  SELECT generate_series("
                + "    (EXTRACT(EPOCH FROM (NOW() - INTERVAL '" + hours + " hours'))::bigint),"
                + "    (EXTRACT(EPOCH FROM NOW())::bigint),"
                + "    EXTRACT(EPOCH FROM INTERVAL '" + bucketHours + " hours')::bigint"
                + "  ) AS bp"
                + "), counted AS ("
                + "  SELECT b.bp, COUNT(ap.gitlab_id)::int AS pipeline_count, "
                + "         COUNT(DISTINCT ap.project_id)::int AS project_count "
                + "  FROM buckets b "
                + "  LEFT JOIN analytics_pipelines ap "
                + "    ON ap.updated_at >= TO_TIMESTAMP(b.bp) "
                + "    AND ap.updated_at < TO_TIMESTAMP(b.bp + EXTRACT(EPOCH FROM INTERVAL '" + bucketHours + " hours')::bigint)"
                + where + " "
                + "  GROUP BY b.bp"
                + ") "
                + "SELECT bp, pipeline_count, project_count "
                + "FROM counted ORDER BY bp DESC LIMIT 12";

            Result<Record> records = dsl.fetch(query);
            boolean showTime = hours <= 48;
            DateTimeFormatter fmt = showTime
                ? DateTimeFormatter.ofPattern("MMM dd HH:mm", java.util.Locale.ENGLISH)
                : DateTimeFormatter.ofPattern("MMM dd", java.util.Locale.ENGLISH);

            for (Record r : records) {
                long epoch = r.get("bp", Long.class);
                Integer pcount = r.get("pipeline_count", Integer.class);
                Integer procount = r.get("project_count", Integer.class);
                String label = Instant.ofEpochSecond(epoch)
                    .atZone(ZoneId.systemDefault()).format(fmt);
                result.add(new AnalyticsHistoryPoint(
                    label,
                    pcount != null ? pcount : 0,
                    procount != null ? procount : 0));
            }
        } catch (Exception e) {
            log.debug("Error building history: {}", e.getMessage());
        }

        while (result.size() < 12) {
            long secNow = System.currentTimeMillis() / 1000L;
            Instant ts = Instant.ofEpochSecond(secNow - (long) result.size() * bucketHours * 3600L);
            boolean showTime = hours <= 48;
            DateTimeFormatter fmt = showTime
                ? DateTimeFormatter.ofPattern("MMM dd HH:mm", java.util.Locale.ENGLISH)
                : DateTimeFormatter.ofPattern("MMM dd", java.util.Locale.ENGLISH);
            result.add(new AnalyticsHistoryPoint(
                ts.atZone(ZoneId.systemDefault()).format(fmt), 0, 0));
        }

        return result;
    }

    // ── SQL helpers ────────────────────────────────────────────

    private void enrichWithAllTimeLastActive(List<UserActivity> users, String gid) {
        if (users.isEmpty()) return;

        List<String> uids = new ArrayList<>();
        for (UserActivity u : users) {
            uids.add(String.valueOf(u.getId()));
        }

        try {
            String sql = "SELECT user_id, MAX(occurred_at) AS max_occurred_at "
                + "FROM analytics_user_events "
                + "WHERE group_id = " + gid
                + " AND user_id IN (" + String.join(",", uids) + ") "
                + "GROUP BY user_id";

            for (Map<String, Object> row : jdbcTemplate.queryForList(sql)) {
                long uid = ((Number) row.get("user_id")).longValue();
                Object maxOccurredAtObj = row.get("max_occurred_at");

                if (maxOccurredAtObj != null) {
                    String maxOccurredAt;
                    if (maxOccurredAtObj instanceof java.sql.Timestamp t) {
                        maxOccurredAt = t.toInstant().toString();
                    } else if (maxOccurredAtObj instanceof java.time.OffsetDateTime odt) {
                        maxOccurredAt = odt.toInstant().toString();
                    } else if (maxOccurredAtObj instanceof java.time.Instant i) {
                        maxOccurredAt = i.toString();
                    } else {
                        maxOccurredAt = maxOccurredAtObj.toString();
                    }
                    
                    for (UserActivity u : users) {
                        if (u.getId() == uid) {
                            String existing = u.getLastActivityOn();
                            if (existing == null || existing.isBlank() || maxOccurredAt.compareTo(existing) > 0) {
                                u.setLastActivityOn(maxOccurredAt);
                            }
                            break;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Error enriching all-time last active: {}", e.getMessage());
        }
    }

    private void enrichWithEvents(List<UserActivity> users, String gid,
                                   long fromEpoch, int hours) {
        if (users.isEmpty() || hours > 90 * 24) return;

        List<Long> uids = new ArrayList<>();
        Map<Long, String> uidMap = new HashMap<>();
        for (UserActivity u : users) {
            uids.add(u.getId());
            uidMap.put(u.getId(), String.valueOf(u.getId()));
        }
        if (uids.isEmpty()) return;

        try {
            String sql = "SELECT user_id, LOWER(action_name::text) AS action_name, "
                + "COALESCE(LOWER(target_type::text), '') AS target_type, "
                + "COUNT(*)::int AS cnt, "
                + "MAX(occurred_at) AS max_occurred_at "
                + "FROM analytics_user_events "
                + "WHERE group_id = " + gid
                + " AND user_id IN (" + String.join(",", uidMap.values()) + ") "
                + "AND occurred_at >= to_timestamp(" + fromEpoch + ") "
                + "GROUP BY user_id, action_name, target_type";

            for (Map<String, Object> row : jdbcTemplate.queryForList(sql)) {
                long uid = ((Number) row.get("user_id")).longValue();
                String action = String.valueOf(row.get("action_name"));
                String tt = String.valueOf(row.get("target_type"));
                int cnt = ((Number) row.get("cnt")).intValue();
                Object maxOccurredAtObj = row.get("max_occurred_at");

                for (UserActivity u : users) {
                    if (u.getId() == uid) {
                        // Update last_pipeline_activity with the max event timestamp if later
                        if (maxOccurredAtObj != null) {
                            String maxOccurredAt;
                            if (maxOccurredAtObj instanceof java.sql.Timestamp t) {
                                maxOccurredAt = t.toInstant().toString();
                            } else if (maxOccurredAtObj instanceof java.time.OffsetDateTime odt) {
                                maxOccurredAt = odt.toInstant().toString();
                            } else if (maxOccurredAtObj instanceof java.time.Instant i) {
                                maxOccurredAt = i.toString();
                            } else {
                                maxOccurredAt = maxOccurredAtObj.toString();
                            }
                            String existing = u.getLastPipelineActivity();
                            if (existing == null || existing.isBlank() || maxOccurredAt.compareTo(existing) > 0) {
                                u.setLastPipelineActivity(maxOccurredAt);
                            }
                        }

                        if (action.contains("comment")) u.setCommentCount(u.getCommentCount() + cnt);
                        else if (action.contains("pushed")) u.setPushCount(u.getPushCount() + cnt);
                        else if (tt.replace("_", "").contains("mergerequest")) {
                            u.setMergeRequestCount(u.getMergeRequestCount() + cnt);
                            // GitLab's Events API calls a completed merge request
                            // "accepted"; retain "merged" for compatibility with
                            // previously stored or self-managed GitLab event data.
                            if (action.contains("accepted") || action.contains("merged")) {
                                u.setMergedCount(u.getMergedCount() + cnt);
                            }
                        }
                        else if (tt.contains("issue")) u.setIssueCount(u.getIssueCount() + cnt);
                        break;
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Error enriching events: {}", e.getMessage());
        }
    }

    private void enrichWithIssues(List<UserActivity> users, String gid,
                                   long fromEpoch, int hours) {
        if (users.isEmpty() || hours > 90 * 24) return;

        List<Long> uids = new ArrayList<>();
        Map<Long, String> uidMap = new HashMap<>();
        for (UserActivity u : users) {
            uids.add(u.getId());
            uidMap.put(u.getId(), String.valueOf(u.getId()));
        }
        if (uids.isEmpty()) return;

        try {
            String sql = "SELECT user_id, COUNT(*)::int AS issue_count "
                + "FROM analytics_user_issues "
                + "WHERE group_id = " + gid
                + " AND user_id IN (" + String.join(",", uidMap.values()) + ") "
                + "AND occurred_at >= to_timestamp(" + fromEpoch + ") "
                + "GROUP BY user_id";

            for (Map<String, Object> row : jdbcTemplate.queryForList(sql)) {
                long uid = ((Number) row.get("user_id")).longValue();
                int cnt = ((Number) row.get("issue_count")).intValue();

                for (UserActivity u : users) {
                    if (u.getId() == uid) {
                        u.setIssueCount(u.getIssueCount() + cnt);
                        break;
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Error enriching issues: {}", e.getMessage());
        }
    }

    private void sortUsers(List<UserActivity> users) {
        users.sort((a, b) -> {
            int ta = a.getTotalActivity();
            int tb = b.getTotalActivity();
            int c = Integer.compare(tb, ta);
            if (c != 0) return c;
            c = Integer.compare(b.getPushCount(), a.getPushCount());
            if (c != 0) return c;
            c = Integer.compare(b.getMergeRequestCount(), a.getMergeRequestCount());
            if (c != 0) return c;
            c = Integer.compare(b.getIssueCount(), a.getIssueCount());
            if (c != 0) return c;
            return Integer.compare(b.getCommentCount(), a.getCommentCount());
        });
    }

    private AnalyticsSummary buildEmptySummary(int hours) {
        List<AnalyticsHistoryPoint> history = new ArrayList<>();
        int bh = hours <= 12 ? 1 : hours <= 72 ? 6 : 24;
        boolean st = hours <= 48;
        DateTimeFormatter fmt = st
            ? DateTimeFormatter.ofPattern("MMM dd HH:mm", java.util.Locale.ENGLISH)
            : DateTimeFormatter.ofPattern("MMM dd", java.util.Locale.ENGLISH);

        for (int i = 0; i < 12; i++) {
            Instant ts = Instant.ofEpochSecond(
                System.currentTimeMillis() / 1000L - (long) i * bh * 3600L);
            history.add(new AnalyticsHistoryPoint(
                ts.atZone(ZoneId.systemDefault()).format(fmt), 0, 0));
        }

        return new AnalyticsSummary(
            (hours + 23) / 24, hours, 0, 0, 0,
            0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, history, 0.0);
    }

    /**
     * Parse the frontend group_ids CSV into the native GitLab group ids used as
     * the analytics_*.group_id DB key. The frontend sends federated ids
     * (namespace &lt;&lt; 44 | local); decoding is idempotent for native ids, so
     * both forms resolve to the stored local group id.
     */
    private String[] parseGroupIds(String csv) {
        if (csv == null || csv.trim().isEmpty()) {
            try {
                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT DISTINCT group_id FROM analytics_projects WHERE group_id IS NOT NULL");
                String[] ids = new String[rows.size()];
                for (int i = 0; i < rows.size(); i++)
                    ids[i] = rows.get(i).get("group_id").toString();
                return ids;
            } catch (Exception e) {
                return new String[0];
            }
        }
        String[] tokens = csv.split(",");
        String[] ids = new String[tokens.length];
        for (int i = 0; i < tokens.length; i++) {
            String trimmed = tokens[i].trim();
            try {
                ids[i] = String.valueOf(FederatedIdUtility.decode(Long.parseLong(trimmed))[1]);
            } catch (NumberFormatException e) {
                log.warn("Unparseable group id in CSV: {}", trimmed);
                ids[i] = trimmed;
            }
        }
        return ids;
    }

    private String groupList(String[] groupIds) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < groupIds.length; i++) {
            if (i > 0) sb.append(",");
            sb.append(groupIds[i]);
        }
        return sb.toString();
    }

    private void prepareGroupParams(String[] groupIds, List<Object> params) {
        for (String id : groupIds) {
            params.add(Long.parseLong(id));
        }
    }

    private String buildGroupInClause(String[] groupIds, int startIndex) {
        if (groupIds.length == 0) return "";
        StringBuilder clause = new StringBuilder("?");
        for (int i = 1; i < groupIds.length; i++) {
            clause.append(",?");
        }
        return clause.toString();
    }

    private String buildGroupFilter(String[] groupIds) {
        if (groupIds == null || groupIds.length == 0) return "";
        return " IN (" + groupList(groupIds) + ")";
    }

    // ── Count helpers ──────────────────────────────────────────

    private int fetchPipedCount(String[] groupIds) {
        try {
            if (groupIds.length == 0) {
                return fetchSingleInt("SELECT COUNT(*) FROM analytics_projects");
            }
            java.util.List<Object> params = new java.util.ArrayList<>();
            prepareGroupParams(groupIds, params);
            return fetchSingleInt("SELECT COUNT(*) FROM analytics_projects WHERE group_id IN ("
                + buildGroupInClause(groupIds, 0) + ")", params.toArray());
        } catch (Exception e) {
            return 0;
        }
    }

    private int fetchPipedPipelineCount(String[] groupIds) {
        try {
            if (groupIds.length == 0) {
                return fetchSingleInt("SELECT COUNT(*) FROM analytics_pipelines");
            }
            java.util.List<Object> params = new java.util.ArrayList<>();
            prepareGroupParams(groupIds, params);
            return fetchSingleInt("SELECT COUNT(*) FROM analytics_pipelines ap "
                + "JOIN analytics_projects p ON ap.project_id = p.gitlab_id "
                + "WHERE p.group_id IN (" + buildGroupInClause(groupIds, 0) + ")", params.toArray());
        } catch (Exception e) {
            return 0;
        }
    }

    private String buildUserCountSql(String[] groupIds) {
        if (groupIds.length == 0) {
            return "SELECT COUNT(DISTINCT gitlab_id) FROM analytics_users";
        }
        return "SELECT COUNT(DISTINCT gitlab_id) FROM analytics_users "
            + "WHERE group_id IN (" + buildGroupInClause(groupIds, 0) + ")";
    }

    private int fetchCount(String table, String whereFilter) {
        try {
            String sql = "SELECT COUNT(*) FROM " + table
                + (whereFilter != null && !whereFilter.isEmpty() ? " WHERE group_id" + whereFilter : "");
            return fetchSingleInt(sql);
        } catch (Exception e) {
            return 0;
        }
    }

    private int fetchDistinctCount(String table, String column, String whereFilter) {
        try {
            String sql = "SELECT COUNT(DISTINCT " + column + ") FROM " + table
                + (whereFilter != null && !whereFilter.isEmpty() ? " WHERE group_id" + whereFilter : "");
            return fetchSingleInt(sql);
        } catch (Exception e) {
            return 0;
        }
    }

    private Integer fetchSingleInt(String sql) {
        try {
            List<Integer> list = jdbcTemplate.queryForList(sql, Integer.class);
            return (list != null && !list.isEmpty()) ? list.get(0) : 0;
        } catch (Exception e) {
            throw new RuntimeException("SQL query failed: " + sql, e);
        }
    }

    private Integer fetchSingleInt(String sql, Object... params) {
        try {
            List<Integer> list = jdbcTemplate.queryForList(sql, Integer.class, params);
            return (list != null && !list.isEmpty()) ? list.get(0) : 0;
        } catch (Exception e) {
            log.error("SQL query failed: {} params: {} error: {}", sql, Arrays.toString(params), e.getMessage());
            throw new RuntimeException("SQL query failed: " + sql, e);
        }
    }

    private Instant toInstant(Record record, String col) {
        if (record == null) return null;
        Object v = record.get(col);
        if (v == null) return null;
        if (v instanceof Instant i) return i;
        if (v instanceof Timestamp t) return t.toInstant();
        if (v instanceof java.util.Date d) return d.toInstant();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toInstant();
        return null;
    }

    private String toStr(Record record, String col) {
        if (record == null) return null;
        return record.get(col, String.class);
    }

    private java.time.Instant parseInstant(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        try {
            return java.time.Instant.parse(value.trim());
        } catch (Exception e) {
            log.debug("Invalid activity datetime filter '{}': {}", value, e.getMessage());
            return null;
        }
    }

    private boolean matchesTimeFilter(UserActivity u, java.time.Instant after, java.time.Instant before) {
        String lastActivity = u.getLastActivityOn();
        String lastPipelineActivity = u.getLastPipelineActivity();

        // Use the latest of the two as the activity timestamp
        java.time.Instant timestamp = null;

        if (lastActivity != null && !lastActivity.isEmpty()) {
            try {
                timestamp = java.time.Instant.parse(lastActivity);
            } catch (Exception ignored) {
                // try ISO 8601 without timezone
                try {
                    timestamp = java.time.LocalDateTime.parse(lastActivity,
                        java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME).toInstant(
                            java.time.ZoneOffset.UTC);
                } catch (Exception ignored2) {}
            }
        }

        if (lastPipelineActivity != null && !lastPipelineActivity.isEmpty()) {
            Instant pTime;
            try {
                pTime = Instant.parse(lastPipelineActivity);
                if (timestamp == null || pTime.isAfter(timestamp)) {
                    timestamp = pTime;
                }
            } catch (Exception ignored) {
                try {
                    pTime = java.time.LocalDateTime.parse(lastPipelineActivity,
                        java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME).toInstant(
                            java.time.ZoneOffset.UTC);
                    if (timestamp == null || pTime.isAfter(timestamp)) {
                        timestamp = pTime;
                    }
                } catch (Exception ignored2) {}
            }
        }

        if (timestamp == null) return true; // no activity = show
        if (after != null && !timestamp.isAfter(after)) return false;
        if (before != null && !timestamp.isBefore(before)) return false;
        return true;
    }
}
