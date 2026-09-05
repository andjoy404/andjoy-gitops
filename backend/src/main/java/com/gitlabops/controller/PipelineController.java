package com.gitlabops.controller;

import com.gitlabops.model.dto.JobDTO;
import com.gitlabops.service.GitLabClient;
import com.gitlabops.service.JobService;
import com.gitlabops.config.UiProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api")
public class PipelineController {

    private final JobService jobService;
    private final GitLabClient gitLabClient;
    private final UiProperties uiProperties;

    public PipelineController(JobService jobService,
                              GitLabClient gitLabClient,
                              UiProperties uiProperties) {
        this.jobService = jobService;
        this.gitLabClient = gitLabClient;
        this.uiProperties = uiProperties;
    }

    @GetMapping("/jobs")
    public ResponseEntity<List<JobDTO>> getJobs(
            @RequestParam long project_id,
            @RequestParam long pipeline_id,
            @RequestParam(required = false) String scope) {
        String[] statuses = null;
        if (scope != null && !scope.trim().isEmpty()) {
            statuses = scope.split(",");
        }
        return ResponseEntity.ok(jobService.getJobs(project_id, pipeline_id, statuses));
    }

    @GetMapping("/jobs/batch")
    public ResponseEntity<List<JobDTO>> getBatchJobs(
            @RequestParam(value = "pipeline_ids", required = false) String pipelineIds,
            @RequestParam(value = "project_ids", required = false) String projectIds) {
        List<Long> pipelineIdList = (pipelineIds != null && !pipelineIds.trim().isEmpty())
            ? Stream.of(pipelineIds.split(",")).map(String::trim).map(Long::parseLong).toList() : null;
        List<Long> projectIdList = (projectIds != null && !projectIds.trim().isEmpty())
            ? Stream.of(projectIds.split(",")).map(String::trim).map(Long::parseLong).toList() : null;
        return ResponseEntity.ok(jobService.getBatchJobs(pipelineIdList, projectIdList));
    }

    @PostMapping("/pipelines/start")
    public ResponseEntity<?> startPipeline(
            @RequestBody Map<String, Object> body) {
        if (uiProperties.isReadOnly()) {
            return ResponseEntity.status(403)
                    .body(Map.of("error", "Pipeline actions are not allowed in read-only mode"));
        }

        Object projectIdObj = body.get("project_id");
        Object branchObj = body.get("branch");

        if (projectIdObj == null || branchObj == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "project_id and branch are required"));
        }

        long projectId = Long.valueOf(projectIdObj.toString());
        String branch = branchObj.toString();

        Object envVarsObj = body.get("env_vars");
        Map<String, String> envVars = null;
        if (envVarsObj instanceof Map<?, ?> envMap) {
            envVars = new java.util.LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : envMap.entrySet()) {
                envVars.put(String.valueOf(entry.getKey()), String.valueOf(entry.getValue()));
            }
        }

        return gitLabClient.startPipeline(projectId, branch, envVars);
    }

    @PostMapping("/pipelines/retry")
    public ResponseEntity<?> retryPipeline(
            @RequestParam long project_id,
            @RequestParam long pipeline_id) {
        if (uiProperties.isReadOnly()) {
            return ResponseEntity.status(403)
                    .body(Map.of("error", "Pipeline actions are not allowed in read-only mode"));
        }
        return gitLabClient.retryPipeline(project_id, pipeline_id);
    }

    @PostMapping("/pipelines/cancel")
    public ResponseEntity<?> cancelPipeline(
            @RequestParam long project_id,
            @RequestParam long pipeline_id) {
        if (uiProperties.isReadOnly()) {
            return ResponseEntity.status(403)
                    .body(Map.of("error", "Pipeline actions are not allowed in read-only mode"));
        }
        return gitLabClient.cancelPipeline(project_id, pipeline_id);
    }

    @GetMapping("/projects/{projectId}/branches")
    public ResponseEntity<List<Map<String, Object>>> getProjectBranches(
            @PathVariable long projectId) {
        return gitLabClient.getBranches(projectId);
    }

    @GetMapping("/artifacts/job/{job_id}")
    public ResponseEntity<?> downloadArtifact(
            @PathVariable long job_id,
            @RequestParam long project_id) {
        return gitLabClient.getJobArtifacts(project_id, job_id);
    }
}
