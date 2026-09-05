package com.gitlabops.service;

import com.gitlabops.repository.EnvironmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class GitLabClient {

    private static final Logger log = LoggerFactory.getLogger(GitLabClient.class);

    private static final String GITLAB_PRIVATE_TOKEN_HEADER = "PRIVATE-TOKEN";

    private final EnvironmentRepository environmentRepository;
    private final EncryptionService encryptionService;
    private final WebClient gitlabWebClient;

    public GitLabClient(EnvironmentRepository environmentRepository,
                        EncryptionService encryptionService,
                        WebClient gitlabWebClient) {
        this.environmentRepository = environmentRepository;
        this.encryptionService = encryptionService;
        this.gitlabWebClient = gitlabWebClient;
    }

    private WebClient buildClient(String baseUrl, String token) {
        return WebClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(GITLAB_PRIVATE_TOKEN_HEADER, token)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    private Optional<EnvironmentRepository.EnvironmentClientConfig> getEnabledClient() {
        List<EnvironmentRepository.EnvironmentClientConfig> clients =
                environmentRepository.getEnabledClients();
        return clients.stream().findFirst();
    }

    private WebClientClientConfig getClientConfig() {
        return getEnabledClient()
                .map(env -> {
                    String baseUrl = env.url();
                    String token = env.token();
                    if (baseUrl != null && !baseUrl.endsWith("/api/v4")) {
                        baseUrl = baseUrl + "/api/v4";
                    }
                    return new WebClientClientConfig(baseUrl, token);
                })
                .orElse(null);
    }

    public ResponseEntity<Map<String, Object>> startPipeline(long projectId, String branch,
                                                              Map<String, String> envVars) {
        WebClientClientConfig config = getClientConfig();
        if (config == null || config.token() == null || config.token().isEmpty()) {
            return ResponseEntity.status(502)
                    .body(Map.of("error", "No GitLab environment configured"));
        }

        try {
            var client = buildClient(config.baseUrl(), config.token());

            String path = String.format("projects/%d/pipeline?ref=%s", projectId, branch);

            Map<String, Object> body = null;
            if (envVars != null && !envVars.isEmpty()) {
                java.util.List<Map<String, String>> variables = new java.util.ArrayList<>();
                for (Map.Entry<String, String> entry : envVars.entrySet()) {
                    java.util.Map<String, String> varMap = new java.util.LinkedHashMap<>();
                    varMap.put("key", entry.getKey());
                    varMap.put("value", entry.getValue());
                    variables.add(varMap);
                }
                body = Map.of("variables", variables);
            }

            var result = client.post()
                    .uri(path)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Failed to start pipeline for project {}: {}", projectId, e.getMessage());
            return ResponseEntity.status(502)
                    .body(Map.of("error", "Failed to start pipeline: " + e.getMessage()));
        }
    }

    public ResponseEntity<Map<String, Object>> retryPipeline(long projectId, long pipelineId) {
        WebClientClientConfig config = getClientConfig();
        if (config == null || config.token() == null || config.token().isEmpty()) {
            return ResponseEntity.status(502)
                    .body(Map.of("error", "No GitLab environment configured"));
        }

        try {
            var client = buildClient(config.baseUrl(), config.token());

            String path = String.format("/projects/%d/pipelines/%d/retry", projectId, pipelineId);

            var result = client.post()
                    .uri(path)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Failed to retry pipeline {}/{}: {}", projectId, pipelineId, e.getMessage());
            return ResponseEntity.status(502)
                    .body(Map.of("error", "Failed to retry pipeline: " + e.getMessage()));
        }
    }

    public ResponseEntity<Map<String, Object>> cancelPipeline(long projectId, long pipelineId) {
        WebClientClientConfig config = getClientConfig();
        if (config == null || config.token() == null || config.token().isEmpty()) {
            return ResponseEntity.status(502)
                    .body(Map.of("error", "No GitLab environment configured"));
        }

        try {
            var client = buildClient(config.baseUrl(), config.token());

            String path = String.format("/projects/%d/pipelines/%d/cancel", projectId, pipelineId);

            var result = client.post()
                    .uri(path)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Failed to cancel pipeline {}/{}: {}", projectId, pipelineId, e.getMessage());
            return ResponseEntity.status(502)
                    .body(Map.of("error", "Failed to cancel pipeline: " + e.getMessage()));
        }
    }

    @SuppressWarnings("unchecked")
    public ResponseEntity<List<Map<String, Object>>> getPipelines(long projectId) {
        WebClientClientConfig config = getClientConfig();
        if (config == null || config.token() == null || config.token().isEmpty()) {
            return ResponseEntity.status(502)
                    .body(Collections.emptyList());
        }

        try {
            var client = buildClient(config.baseUrl(), config.token());

            String path = String.format("/projects/%d/pipelines", projectId);
            List<Map> rawResult = client.get()
                    .uri(path)
                    .retrieve()
                    .bodyToFlux(Map.class)
                    .collectList()
                    .block();

            List<Map<String, Object>> result = rawResult != null ? (List<Map<String, Object>>)(List<?>)rawResult : Collections.emptyList();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Failed to get pipelines for project {}: {}", projectId, e.getMessage());
            return ResponseEntity.status(502)
                    .body(Collections.emptyList());
        }
    }

    @SuppressWarnings("unchecked")
    public ResponseEntity<List<Map<String, Object>>> getBranches(long projectId) {
        WebClientClientConfig config = getClientConfig();
        if (config == null || config.token() == null || config.token().isEmpty()) {
            return ResponseEntity.status(502)
                    .body(Collections.emptyList());
        }

        try {
            var client = buildClient(config.baseUrl(), config.token());

            String path = String.format("/projects/%d/repository/branches", projectId);
            List<Map> rawResult = client.get()
                    .uri(path)
                    .retrieve()
                    .bodyToFlux(Map.class)
                    .collectList()
                    .block();

            List<Map<String, Object>> result = rawResult != null ? (List<Map<String, Object>>)(List<?>)rawResult : Collections.emptyList();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Failed to get branches for project {}: {}", projectId, e.getMessage());
            return ResponseEntity.status(502)
                    .body(Collections.emptyList());
        }
    }

    public ResponseEntity<byte[]> getJobArtifacts(long projectId, long jobId) {
        WebClientClientConfig config = getClientConfig();
        if (config == null || config.token() == null || config.token().isEmpty()) {
            return ResponseEntity.status(502)
                    .body("No GitLab environment configured".getBytes());
        }

        try {
            var client = buildClient(config.baseUrl(), config.token());

            String path = String.format("/projects/%d/jobs/%d/artifacts", projectId, jobId);

            Mono<byte[]> result = client.get()
                    .uri(path)
                    .retrieve()
                    .bodyToMono(byte[].class);

            byte[] artifacts = result.block();
            if (artifacts == null) {
                return ResponseEntity.status(404).body("No artifacts found".getBytes());
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            headers.setContentDispositionFormData("attachment", "artifacts.zip");
            return new ResponseEntity<>(artifacts, headers, org.springframework.http.HttpStatus.OK);
        } catch (Exception e) {
            log.warn("Failed to get artifacts for job {}/{}: {}", projectId, jobId, e.getMessage());
            return ResponseEntity.status(502)
                    .body(("Failed to download artifacts: " + e.getMessage()).getBytes());
        }
    }

    private record WebClientClientConfig(String baseUrl, String token) {}
}
