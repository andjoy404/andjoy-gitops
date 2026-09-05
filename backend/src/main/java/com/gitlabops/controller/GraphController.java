package com.gitlabops.controller;

import com.gitlabops.model.dto.GraphResponse;
import com.gitlabops.service.GraphService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;

@RestController
@RequestMapping("/api/graph")
public class GraphController {

    private final GraphService graphService;

    public GraphController(GraphService graphService) {
        this.graphService = graphService;
    }

    /**
     * Mode 1: User → Group → Project relationship graph
     */
    @GetMapping
    public ResponseEntity<GraphResponse> userProjectGraph(
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "group_paths", required = false) String groupPaths,
            @RequestParam(value = "user_ids", required = false) String userIds,
            @RequestParam(value = "project_ids", required = false) String projectIds) {
        return ResponseEntity.ok(graphService.getUserProjectGraph(groupIds, groupPaths, userIds, projectIds));
    }

    /**
     * Mode 2: Project → Branch → Pipeline → Job relationship graph
     */
    @GetMapping("/cicd")
    public ResponseEntity<GraphResponse> cicdGraph(
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "group_paths", required = false) String groupPaths,
            @RequestParam(value = "project_ids", required = false) String projectIds,
            @RequestParam(value = "branch_names", required = false) String branchNames,
            @RequestParam(value = "pipeline_statuses", required = false) String pipelineStatuses,
            @RequestParam(value = "job_statuses", required = false) String jobStatuses,
            @RequestParam(value = "hours", required = false, defaultValue = "24") Integer hours) {
        return ResponseEntity.ok(graphService.getCICDGraph(
                groupIds, groupPaths, projectIds, branchNames, pipelineStatuses, jobStatuses, hours));
    }

    /**
     * Return filter options for the Relations Map UI.
     *
     * Cascade scoping: project_ids narrows users/branches to those linked to
     * the given projects; user_ids narrows projects to those linked to the
     * given users. group_ids/group_paths stay the outer bound. project/user id
     * params are already native GitLab ids; only group_ids are federated and
     * decoded downstream; group_paths are native full_path strings (e.g.
     * "appfluxion/agis").
     */
    @GetMapping("/options")
    public ResponseEntity<Map<String, Object>> getOptions(
            @RequestParam(value = "type", required = false, defaultValue = "users") String type,
            @RequestParam(value = "group_ids", required = false) String groupIds,
            @RequestParam(value = "group_paths", required = false) String groupPaths,
            @RequestParam(value = "project_ids", required = false) String projectIds,
            @RequestParam(value = "user_ids", required = false) String userIds,
            @RequestParam(value = "hours", required = false, defaultValue = "24") Integer hours,
            @RequestParam(value = "cicd", required = false, defaultValue = "false") boolean cicd) {
        Map<String, Object> options = new HashMap<>();

        if ("users".equals(type)) {
            options.put("users", graphService.graphUsers(groupIds, projectIds, groupPaths));
            options.put("projects", graphService.graphProjects(groupIds, userIds, groupPaths, hours, cicd));
            options.put("branches", graphService.graphBranches(groupIds, projectIds, groupPaths, hours, cicd));
        } else if ("projects".equals(type)) {
            options.put("projects", graphService.graphProjects(groupIds, userIds, groupPaths, hours, cicd));
            options.put("branches", graphService.graphBranches(groupIds, projectIds, groupPaths, hours, cicd));
        } else if ("pipeline-statuses".equals(type)) {
            options.put("statuses", Arrays.asList(
                    "running", "success", "failed", "canceled",
                    "skipped", "manual", "pending", "created",
                    "scheduled", "preparing", "waiting_for_resource"
            ));
        } else if ("job-statuses".equals(type)) {
            options.put("statuses", Arrays.asList(
                    "running", "success", "failed", "canceled",
                    "skipped", "manual", "pending", "created",
                    "waiting_for_resource"
            ));
        }

        return ResponseEntity.ok(options);
    }
}
