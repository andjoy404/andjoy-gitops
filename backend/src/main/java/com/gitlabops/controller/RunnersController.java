package com.gitlabops.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gitlabops.service.GitLabApiClient;
import com.gitlabops.service.GitLabApiClient.GitLabApiException;
import com.gitlabops.util.FederatedIdUtility;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;

@RestController
@RequestMapping("/api")
public class RunnersController {

    private static final Logger log = LoggerFactory.getLogger(RunnersController.class);

    private final GitLabApiClient gitLabApiClient;
    private final DSLContext dsl;
    private final ObjectMapper objectMapper;

    public RunnersController(GitLabApiClient gitLabApiClient, DSLContext dsl, ObjectMapper objectMapper) {
        this.gitLabApiClient = gitLabApiClient;
        this.dsl = dsl;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/runners")
    public ResponseEntity<?> getRunners(
            @RequestParam(defaultValue = "false") boolean refresh,
            @RequestParam(value = "group_id", required = false, defaultValue = "123") Long groupId,
            @RequestParam(value = "environment_id", required = false) Long environmentId) {

        try {
            long[] decoded = FederatedIdUtility.decode(groupId);
            long localGroupId = decoded[1];
            // The active environment is the source of truth for which GitLab client/token
            // to use. The namespace encoded in the group ID is only the fallback for
            // legacy clients that do not send environment_id.
            long namespaceId = environmentId != null
                    ? gitLabApiClient.namespaceForEnvironmentId(environmentId)
                    : decoded[0];

            // The scheduled collector owns GitLab synchronization. Normal page loads read
            // the latest persisted snapshot so a transient GitLab 429 cannot blank the UI.
            // The snapshot is stored keyed by the native local group id.
            List<Map<String, Object>> runnersRaw = refresh
                    ? gitLabApiClient.getRunnersForGroup(localGroupId, namespaceId)
                    : loadPersistedRunners(localGroupId);
            if (refresh && runnersRaw.isEmpty()) {
                runnersRaw = loadPersistedRunners(localGroupId);
            }

            // Get the current job for each runner
            // We fetch jobs from the GitLab API
            Map<Long, List<Map<String, Object>>> runnerJobs = new LinkedHashMap<>();

            for (Map<String, Object> runner : runnersRaw) {
                Object rid = runner.get("id");
                if (rid instanceof Number) {
                    long runnerId = ((Number) rid).longValue();
                    // Try to fetch active jobs for this runner
                    // The GitLab API doesn't expose this directly, so we'll use whatever is
                    // available from the runner object
                    List<Map<String, Object>> jobs = (List<Map<String, Object>>) runner.get("current_jobs");
                    runnerJobs.put(runnerId, jobs != null ? jobs : Collections.emptyList());
                }
            }

            // Build response in the format expected by the old frontend
            List<Map<String, Object>> result = new ArrayList<>();

            // Group runners by their group_id (use the single groupId)
            Map<Long, Map<String, Object>> groupedRunners = new LinkedHashMap<>();
            for (Map<String, Object> runner : runnersRaw) {
                Object rid = runner.get("id");
                if (rid instanceof Number) {
                    long runnerId = ((Number) rid).longValue();
                    // Check if this runner has projects assigned
                    Object projects = runner.get("projects");
                    if (projects instanceof List && !((List<?>) projects).isEmpty()) {
                        // project-type runner
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> projectsList = (List<Map<String, Object>>) projects;
                        for (Map<String, Object> project : projectsList) {
                            Object pid = project.get("id");
                            if (pid instanceof Number) {
                                long projectId = ((Number) pid).longValue();
                                // Create a RunnerWithJobs entry per project association
                                Map<String, Object> entry = buildRunnerEntry(runnerId, runner, runnerJobs.get(runnerId), (long) groupId);
                                result.add(entry);
                                groupedRunners.put(runnerId, entry);
                                break;
                            }
                        }
                    }
                    if (!groupedRunners.containsKey(runnerId)) {
                        // group-type or no project
                        Map<String, Object> entry = buildRunnerEntry(runnerId, runner, runnerJobs.get(runnerId), (long) groupId);
                        if (!groupedRunners.containsKey(runnerId)) {
                            result.add(entry);
                            groupedRunners.put(runnerId, entry);
                        }
                    }
                }
            }

            return ResponseEntity.ok(result.isEmpty() ? Collections.emptyList() : result);

        } catch (GitLabApiException e) {
            // A real GitLab failure (401/403/404/429/5xx or network error). Surface it so the
            // UI can show an error state instead of pretending the group has no runners.
            log.warn("Failed to fetch runners for group {}: {}", groupId, e.getMessage());
            HttpStatus status = mapGitLabStatus(e);
            return ResponseEntity.status(status)
                    .body(Map.of("error", e.getMessage() == null ? "Failed to fetch runners from GitLab" : e.getMessage()));
        } catch (IllegalArgumentException e) {
            log.warn("Invalid runner request: {}", e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    private HttpStatus mapGitLabStatus(GitLabApiException e) {
        String msg = e.getMessage();
        if (msg == null) return HttpStatus.BAD_GATEWAY;
        if (msg.contains("401") || msg.contains("403") || msg.contains("Unauthorized")
                || msg.contains("Forbidden") || msg.contains("Access Denied")) {
            return HttpStatus.FORBIDDEN;
        }
        if (msg.contains("404") || msg.contains("Not Found")) {
            return HttpStatus.NOT_FOUND;
        }
        return HttpStatus.BAD_GATEWAY;
    }

    private List<Map<String, Object>> loadPersistedRunners(long groupId) {
        try {
            String payload = dsl.select(DSL.field("payload::text", String.class))
                    .from(DSL.table(DSL.name("analytics_runner_state")))
                    .where(DSL.field(DSL.name("group_id"), Long.class).eq(groupId))
                    .fetchOneInto(String.class);
            if (payload == null || payload.isBlank()) return Collections.emptyList();
            return objectMapper.readValue(payload, new TypeReference<>() {});
        } catch (Exception e) {
            log.debug("Failed to load persisted runners for group {}: {}", groupId, e.getMessage());
            return Collections.emptyList();
        }
    }

    private Map<String, Object> buildRunnerEntry(long runnerId, Map<String, Object> runner,
                                                 List<Map<String, Object>> jobs, Long groupId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("group_id", groupId);

        Map<String, Object> runnerData = new LinkedHashMap<>();
        runnerData.put("id", runnerId);
        runnerData.put("description", runner.getOrDefault("description", ""));
        runnerData.put("is_shared", runner.getOrDefault("is_shared", false));
        runnerData.put("runner_type", runner.getOrDefault("runner_type", ""));
        runnerData.put("status", runner.getOrDefault("status", ""));
        runnerData.put("online", runner.getOrDefault("online", false));
        runnerData.put("job_execution_status", runner.getOrDefault("job_execution_status", ""));
        runnerData.put("paused", runner.getOrDefault("paused", false));
        runnerData.put("ip_address", runner.getOrDefault("ip_address", ""));
        runnerData.put("tag_list", runner.getOrDefault("tag_list", ""));
        runnerData.put("scope_name", runner.getOrDefault("scope_name", ""));
        runnerData.put("contacted_at", runner.getOrDefault("contacted_at", ""));

        // Process projects
        Object projects = runner.get("projects");
        List<Map<String, String>> projectList = new ArrayList<>();
        if (projects instanceof List<?> projList) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rawProjects = (List<Map<String, Object>>) projList;
            for (Map<String, Object> p : rawProjects) {
                Map<String, String> proj = new LinkedHashMap<>();
                proj.put("id", String.valueOf(p.getOrDefault("id", 0)));
                proj.put("name", String.valueOf(p.getOrDefault("name", "")));
                proj.put("path_with_namespace", String.valueOf(p.getOrDefault("path_with_namespace", "")));
                projectList.add(proj);
            }
        }
        runnerData.put("projects", projectList);

        Object tagList = runner.get("tag_list");
        if (tagList instanceof List) {
            runnerData.put("tag_list", tagList);
        } else if (tagList instanceof String) {
            // GitLab API returns tag_list as a string sometimes with the full object response
            runnerData.put("tag_list", Collections.emptyList());
        }

        result.put("runner", runnerData);
        result.put("jobs", jobs != null ? jobs : Collections.emptyList());
        return result;
    }
}
