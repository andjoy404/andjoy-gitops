package com.gitlabops.controller;

import com.gitlabops.config.UiProperties;
import com.gitlabops.model.dto.AnalyticsReadiness;
import com.gitlabops.model.dto.AnalyticsSummary;
import com.gitlabops.model.dto.PaginatedPipelineResponse;
import com.gitlabops.model.dto.PaginatedUserActivity;
import com.gitlabops.model.dto.UserActivity;
import com.gitlabops.model.dto.UserMetrics;
import com.gitlabops.model.dto.UserProjectRelation;
import com.gitlabops.service.AnalyticsService;
import com.gitlabops.service.AnalyticsSyncService;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/analytics")
@ConditionalOnProperty(name = "analytics.enabled", havingValue = "true", matchIfMissing = false)
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final AnalyticsSyncService analyticsSyncService;
    private final UiProperties uiProperties;

    public AnalyticsController(AnalyticsService analyticsService,
                               AnalyticsSyncService analyticsSyncService,
                               UiProperties uiProperties) {
        this.analyticsService = analyticsService;
        this.analyticsSyncService = analyticsSyncService;
        this.uiProperties = uiProperties;
    }

    @GetMapping("/readiness")
    public ResponseEntity<AnalyticsReadiness> readiness(
            @RequestParam(value = "group_ids", required = false) String groupIds) {
        return ResponseEntity.ok(analyticsService.getReadiness(groupIds));
    }

    @GetMapping("/summary")
    public ResponseEntity<AnalyticsSummary> summary(
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "hours", required = false, defaultValue = "24") Integer hours,
            @RequestParam(value = "pipeline_view", required = false, defaultValue = "latest") String pipelineView) {

        if (hours == null || hours < 1) hours = 24;
        if (hours > 365 * 24) hours = 365 * 24;

        if (pipelineView == null || pipelineView.isEmpty()) {
            pipelineView = "latest";
        }
        if (!"all".equals(pipelineView) && !"latest".equals(pipelineView)) {
            pipelineView = "latest";
        }

        return ResponseEntity.ok(analyticsService.getSummary(groupIds, hours, pipelineView));
    }

    @GetMapping("/users")
    public ResponseEntity<PaginatedUserActivity> users(
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "hours", required = false, defaultValue = "24") Integer hours,
            @RequestParam(value = "activity_after", required = false) String activityAfter,
            @RequestParam(value = "activity_before", required = false) String activityBefore,
            @RequestParam(value = "refresh", required = false) Boolean refresh,
            @RequestParam(value = "membership", required = false, defaultValue = "both") String membership,
            @RequestParam(value = "user_ids", required = false) String userIds,
            @RequestParam(value = "search", required = false) String search,
            @RequestParam(value = "page", required = false, defaultValue = "1") Integer page,
            @RequestParam(value = "page_size", required = false) Integer pageSize,
            @RequestParam(value = "sort_by", required = false) String sortBy,
            @RequestParam(value = "sort_order", required = false, defaultValue = "asc") String sortOrder) {

        if (hours == null || hours < 1) hours = 24;

        if (page == null || page < 1) page = 1;

        if (pageSize == null) {
            List<Integer> options = uiProperties.getPageSizeOptions();
            pageSize = uiProperties.getDefaultPageSize();
            if (!options.contains(pageSize)) {
                pageSize = options.get(0);
            }
        } else {
            List<Integer> options = uiProperties.getPageSizeOptions();
            if (!options.contains(pageSize)) {
                int currentSize = pageSize;
                try {
                    pageSize = options.stream()
                        .filter(p -> p == currentSize)
                        .findFirst()
                        .orElse(uiProperties.getDefaultPageSize());
                } catch (Exception ignored) {
                    pageSize = options.get(0);
                }
            }
        }

        if (Boolean.TRUE.equals(refresh)) {
            try {
                analyticsSyncService.triggerManualSync();
            } catch (Exception e) {
                // refresh is fire-and-forget
            }
        }

        return ResponseEntity.ok(analyticsService.getPageUsers(
            groupIds, hours, activityAfter, activityBefore, membership, userIds, search,
            page, pageSize, sortBy, sortOrder));
    }

    /**
     * Returns the complete user directory for the selector. This is intentionally
     * separate from the paginated table endpoint so users on later pages remain
     * searchable and selectable.
     */
    @GetMapping("/users/options")
    public ResponseEntity<List<UserActivity>> userOptions(
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "hours", required = false, defaultValue = "24") Integer hours,
            @RequestParam(value = "membership", required = false, defaultValue = "both") String membership) {
        if (hours == null || hours < 1) hours = 24;
        return ResponseEntity.ok(analyticsService.getAllUsers(
            groupIds, hours, null, null, membership, null, null));
    }

    @GetMapping("/users/metrics")
    public ResponseEntity<UserMetrics> metrics(
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "hours", required = false, defaultValue = "24") Integer hours,
            @RequestParam(value = "membership", required = false, defaultValue = "both") String membership,
            @RequestParam(value = "user_ids", required = false) String userIds,
            @RequestParam(value = "search", required = false) String search) {

        if (hours == null || hours < 1) hours = 24;

        return ResponseEntity.ok(analyticsService.getUserMetrics(groupIds, hours, membership, userIds, search));
    }

    @GetMapping("/users/export")
    @PreAuthorize("hasRole('ADMIN') or hasRole('EDITOR')")
    public ResponseEntity<byte[]> exportUsers(
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "hours", required = false, defaultValue = "24") Integer hours,
            @RequestParam(value = "activity_after", required = false) String activityAfter,
            @RequestParam(value = "activity_before", required = false) String activityBefore,
            @RequestParam(value = "membership", required = false, defaultValue = "both") String membership,
            @RequestParam(value = "user_ids", required = false) String userIds,
            @RequestParam(value = "search", required = false) String search) {

        if (hours == null || hours < 1) hours = 24;

        List<UserActivity> allUsers = analyticsService.getAllUsers(
            groupIds, hours, activityAfter, activityBefore, membership, userIds, search);

        // Build filename: user-activity-{range}.csv (OLD pattern)
        String rangeLabel = "all";
        String rangeLabelLower = "all";
        if (hours == 1) { rangeLabel = "last-1-hour"; rangeLabelLower = "last-1-hour"; }
        else if (hours == 6) { rangeLabel = "last-6-hours"; rangeLabelLower = "last-6-hours"; }
        else if (hours == 12) { rangeLabel = "last-12-hours"; rangeLabelLower = "last-12-hours"; }
        else if (hours == 24) { rangeLabel = "last-24-hours"; rangeLabelLower = "last-24-hours"; }
        else if (hours == 72) { rangeLabel = "last-3-days"; rangeLabelLower = "last-3-days"; }
        else if (hours == 168) { rangeLabel = "last-7-days"; rangeLabelLower = "last-7-days"; }
        else if (hours == 336) { rangeLabel = "last-14-days"; rangeLabelLower = "last-14-days"; }
        else if (hours == 720) { rangeLabel = "last-30-days"; rangeLabelLower = "last-30-days"; }
        else if (hours == 1440) { rangeLabel = "last-60-days"; rangeLabelLower = "last-60-days"; }
        else if (hours == 2160) { rangeLabel = "last-90-days"; rangeLabelLower = "last-90-days"; }

        String filename = "user-activity-" + rangeLabelLower + ".csv";

        // Build CSV with formula-neutralized values
        List<String> lines = new ArrayList<>();
        lines.add("sep=,");
        lines.add("\"User ID\",\"Username\",\"Name\",\"State\",\"Membership\",\"Issues\",\"Merge Requests\",\"Pushes\",\"Comments\",\"Last Activity\",\"Profile URL\"");

        for (UserActivity u : allUsers) {
            String membershipTxt = u.isCurrentMember() ? "Active" : "Non-active";
            String lastActivity = u.getLastActivityOn() != null && !u.getLastActivityOn().isEmpty()
                ? u.getLastActivityOn()
                : (u.getLastPipelineActivity() != null ? u.getLastPipelineActivity() : "");
            String username = neutralizeCsv(u.getUsername());
            String name = neutralizeCsv(u.getName());
            String webUrl = neutralizeCsv(u.getWebUrl());

            lines.add("\"" + u.getId() + "\"," +
                "\"" + username + "\"," +
                "\"" + name + "\"," +
                "\"" + u.getState() + "\"," +
                "\"" + membershipTxt + "\"," +
                "\"" + u.getIssueCount() + "\"," +
                "\"" + u.getMergeRequestCount() + "\"," +
                "\"" + u.getPushCount() + "\"," +
                "\"" + u.getCommentCount() + "\"," +
                "\"" + neutralizeCsv(lastActivity) + "\"," +
                "\"" + webUrl + "\"");
        }

        String csv = String.join("\r\n", lines) + "\r\n";
        byte[] bytes = ("\uFEFF" + csv).getBytes(java.nio.charset.StandardCharsets.UTF_8);

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .contentLength(bytes.length)
            .body(bytes);
    }

    private String neutralizeCsv(String value) {
        if (value == null) return "";
        // Precede with tab to prevent formula injection (replaces leading =,+,-,@)
        String s = value.trim();
        if (!s.isEmpty() && "=@-+".indexOf(s.charAt(0)) != -1) {
            s = "\t" + s;
        }
        return s.replace("\"", "\"\"");
    }

    @GetMapping("/user-project-relations")
    public ResponseEntity<List<UserProjectRelation>> userProjectRelations(
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "user_ids", required = false) String userIds) {
        return ResponseEntity.ok(analyticsService.getUserProjectRelations(groupIds, userIds));
    }

    @GetMapping("/pipelines")
    public ResponseEntity<PaginatedPipelineResponse> pipelines(
            @RequestParam(value = "group_id", required = false) String groupIdCsv,
            @RequestParam(value = "project_ids", required = false) String projectIdsCsv,
            @RequestParam(value = "hours", required = false, defaultValue = "24") Integer hours,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "topics", required = false, defaultValue = "[]") String topics,
            @RequestParam(value = "pipeline_view", required = false, defaultValue = "latest") String pipelineView,
            @RequestParam(value = "page", required = false, defaultValue = "1") Integer page,
            @RequestParam(value = "page_size", required = false) Integer pageSize) {
        if (hours == null || hours < 1) hours = 24;
        if (hours > 365 * 24) hours = 365 * 24;

        if (pipelineView == null || pipelineView.isEmpty()) {
            pipelineView = "latest";
        }
        if (!"all".equals(pipelineView) && !"latest".equals(pipelineView)) {
            pipelineView = "latest";
        }

        if (page == null || page < 1) page = 1;

        if (pageSize == null) {
            List<Integer> options = uiProperties.getPageSizeOptions();
            pageSize = uiProperties.getDefaultPageSize();
            if (!options.contains(pageSize)) {
                pageSize = options.get(0);
            }
        } else {
            List<Integer> options = uiProperties.getPageSizeOptions();
            if (!options.contains(pageSize)) {
                int currentSize = pageSize;
                try {
                    pageSize = options.stream()
                        .filter(p -> p == currentSize)
                        .findFirst()
                        .orElse(uiProperties.getDefaultPageSize());
                } catch (Exception ignored) {
                    // use configured default
                }
            }
        }

        return ResponseEntity.ok(analyticsService.getProjectPipelines(
            groupIdCsv, projectIdsCsv, hours, status, topics, pipelineView, page, pageSize));
    }
}
