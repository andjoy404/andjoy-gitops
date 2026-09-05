package com.gitlabops.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gitlabops.model.dto.GitlabGroup;
import com.gitlabops.repository.EnvironmentRepository.EnvironmentClientConfig;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.util.FederatedIdUtility;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.LinkedHashSet;

/**
 * Synchronous client for GitLab API.
 *
 * <p>Uses RestTemplate for HTTP calls. Handles pagination, rate-limiting,
 * and retry logic. Token is read from gitlab_environments and never logged.</p>
 */
@Service
public class GitLabApiClient {

    private static final Logger log = LoggerFactory.getLogger(GitLabApiClient.class);
    private static final String GITLAB_TOKEN_HEADER = "PRIVATE-TOKEN";
    private static final int DEFAULT_MAX_ATTEMPTS = 4;
    private static final long DEFAULT_RETRY_DELAY_MS = 1000L;

    private final EnvironmentRepository environmentRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SyncMetrics syncMetrics;
    private final int maxAttempts;
    private final long retryDelayMs;

    public GitLabApiClient(EnvironmentRepository environmentRepository,
                           SyncMetrics syncMetrics,
                           @Value("${gitlab.max-retries:3}") int maxRetries,
                           @Value("${gitlab.retry-delay-ms:1000}") long retryDelayMs) {
        this.environmentRepository = environmentRepository;
        this.syncMetrics = syncMetrics;
        this.maxAttempts = maxRetries > 0 ? maxRetries : DEFAULT_MAX_ATTEMPTS;
        this.retryDelayMs = retryDelayMs > 0 ? retryDelayMs : DEFAULT_RETRY_DELAY_MS;
    }

    // ─── Groups ────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<GitlabGroup> getAllGroups() {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clients.get(0);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());
        try {
            String path = "/groups?per_page=100&top_level_only=true&order_by=id&sort=asc&simple=true";
            List<Map<String, Object>> items = fetchPage(rt, cfg.url(), path);
            List<GitlabGroup> groups = new ArrayList<>();
            for (Map<String, Object> m : items) {
                groups.add(new GitlabGroup(
                        ((Number) m.get("id")).longValue(),
                        val(m, "name"), val(m, "path"), val(m, "description"),
                        val(m, "full_name"), val(m, "full_path"),
                        ((Number) m.getOrDefault("parent_id", 0)).intValue(),
                        val(m, "avatar_url"), val(m, "web_url"),
                        false, 0, 0, 0,
                        m.get("web_url") != null ? ((String) m.get("web_url")).hashCode() : 0));
            }
            groups.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));
            return groups;
        } catch (Exception e) {
            log.error("Group fetch failed: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    // ─── Projects ──────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getAllProjectsForGroup(long groupId, boolean includeSubgroups) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clients.get(0);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());
        try {
            String path = "/groups/" + groupId + "/projects?archived=false"
                    + "&include_subgroups=" + includeSubgroups
                    + "&per_page=100&order_by=id&sort=asc";
            return fetchPage(rt, cfg.url(), path);
        } catch (Exception e) {
            log.error("Project fetch for group {} failed: {}", groupId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Project fetch routed to the environment that owns the given namespace.
     *
     * <p>Errors are propagated, not converted to an empty list: a 404/403/5xx on the
     * group must surface to the caller so a broken or inaccessible group is reported
     * as a sync failure instead of being recorded as "0 projects" success. The caller
     * (sync path) distinguishes a legitimate empty group (API returns an empty array)
     * from a failure (HTTP error) via the exception.</p>
     */
    public List<Map<String, Object>> getAllProjectsForGroup(long groupId, boolean includeSubgroups, long namespaceId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clientForNamespace(clients, namespaceId);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());
        String path = "/groups/" + groupId + "/projects?archived=false"
                + "&include_subgroups=" + includeSubgroups
                + "&per_page=100&order_by=id&sort=asc";
        return fetchPage(rt, cfg.url(), path);
    }

    // ─── Pipelines ─────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getPipelinesForProject(long projectId, String updatedAfter) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clients.get(0);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());
        try {
            String path = "/projects/" + projectId + "/pipelines?per_page=100";
            if (updatedAfter != null && !updatedAfter.isEmpty())
                path += "&updated_after=" + updatedAfter;
            return fetchPage(rt, cfg.url(), path);
        } catch (Exception e) {
            log.error("Pipeline fetch for project {} failed: {}", projectId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Fetch all known pipelines for a project, filtered to those updated after
     * {@code updatedAfter} (if provided).
     *
     * <p>Errors are propagated, not converted to an empty list: an HTTP failure
     * on the project's pipeline list must mark the sync as failed (last_error)
     * instead of being silently recorded as "0 new pipelines". A legitimate
     * empty result (GitLab returned an empty array) is still a normal empty
     * list — only actual request failures are surfaced.</p>
     */
    public List<Map<String, Object>> getPipelinesForProject(long projectId, String updatedAfter, long namespaceId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clientForNamespace(clients, namespaceId);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());
        String path = "/projects/" + projectId + "/pipelines?per_page=100";
        if (updatedAfter != null && !updatedAfter.isEmpty())
            path += "&updated_after=" + updatedAfter;
        return fetchPage(rt, cfg.url(), path);
    }

    // ─── Jobs ──────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getJobsForPipeline(long projectId, long pipelineId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clients.get(0);
        return fetchPipelineJobs(makeRt(cfg.url(), cfg.token()), cfg.url(), projectId, pipelineId);
    }

    /**
     * Job fetch routed to the environment that owns the given namespace.
     * Prevents a secondary environment's pipeline from being read from the
     * primary instance's URL/token.
     */
    public List<Map<String, Object>> getJobsForPipeline(long projectId, long pipelineId, long namespaceId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clientForNamespace(clients, namespaceId);
        return fetchPipelineJobs(makeRt(cfg.url(), cfg.token()), cfg.url(), projectId, pipelineId);
    }

    private List<Map<String, Object>> fetchPipelineJobs(RestTemplate rt, String baseUrl,
                                                        long projectId, long pipelineId) {
        List<Map<String, Object>> jobs = new ArrayList<>();
        Deque<PipelineRef> pipelines = new ArrayDeque<>();
        Set<PipelineRef> visited = new LinkedHashSet<>();
        pipelines.add(new PipelineRef(projectId, pipelineId));

        try {
            // Match the old dashboard: show regular jobs, bridge jobs, and jobs from
            // downstream pipelines reached through those bridges.
            while (!pipelines.isEmpty()) {
                PipelineRef current = pipelines.removeFirst();
                if (!visited.add(current)) continue;

                try {
                    jobs.addAll(fetchPage(rt, baseUrl, "/projects/" + current.projectId()
                            + "/pipelines/" + current.pipelineId() + "/jobs?per_page=100"));
                } catch (Exception e) {
                    log.warn("Regular job fetch for pipeline {}/{} failed: {}",
                            current.projectId(), current.pipelineId(), e.getMessage());
                }

                List<Map<String, Object>> bridges;
                try {
                    bridges = fetchPage(rt, baseUrl,
                            "/projects/" + current.projectId() + "/pipelines/"
                                    + current.pipelineId() + "/bridges?per_page=100");
                } catch (Exception e) {
                    log.debug("Bridge discovery unavailable for pipeline {}/{}: {}",
                            current.projectId(), current.pipelineId(), e.getMessage());
                    bridges = Collections.emptyList();
                }
                for (Map<String, Object> bridge : bridges) {
                    jobs.add(bridge);
                    Object downstreamRaw = bridge.get("downstream_pipeline");
                    if (downstreamRaw instanceof Map<?, ?> downstream
                            && downstream.get("project_id") instanceof Number downstreamProject
                            && downstream.get("id") instanceof Number downstreamPipeline) {
                        pipelines.addLast(new PipelineRef(
                                downstreamProject.longValue(), downstreamPipeline.longValue()));
                    }
                }
            }
            return jobs;
        } catch (Exception e) {
            log.error("Job fetch for pipeline {}/{} failed: {}", projectId, pipelineId, e.getMessage());
            return Collections.emptyList();
        }
    }

    private record PipelineRef(long projectId, long pipelineId) {}

    // ─── Runners ───────────────────────────────────────────────

    public List<Map<String, Object>> getRunnersForGroup(long groupId) {
        long[] decoded = FederatedIdUtility.decode(groupId);
        return getRunnersForGroup(decoded[1], decoded[0]);
    }

    /**
     * Fetch runners for a group (and its subgroups) on the GitLab instance that owns
     * the given namespace. Authorization (401/403) and other failures on the requested
     * group surface as GitLabApiException so callers can report an error instead of
     * treating the group as runner-less.
     */
    public List<Map<String, Object>> getRunnersForGroup(long localGroupId, long namespaceId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) {
            throw new GitLabApiException("No enabled GitLab environments are configured");
        }
        EnvironmentClientConfig cfg = clientForNamespace(clients, namespaceId);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());
        Map<Long, Map<String, Object>> seen = new LinkedHashMap<>();
        List<Long> groups = getGroupChain(rt, cfg.url(), localGroupId);
        for (long gid : groups) {
            boolean topLevel = gid == localGroupId;
            try {
                Map<String, Object> group = fetchObject(rt, cfg.url(), "/groups/" + gid);
                String scopeName = val(group, "full_path");
                if (scopeName.isBlank()) scopeName = val(group, "name");
                List<Map<String, Object>> runners = fetchPage(rt, cfg.url(),
                        "/groups/" + gid + "/runners?type=group_type&per_page=100");
                if (runners != null) {
                    for (Map<String, Object> r : runners) {
                        Object ridObj = r.get("id");
                        if (ridObj instanceof Number) {
                            long rid = ((Number) ridObj).longValue();
                            if (!Boolean.TRUE.equals(r.get("is_shared")) && !seen.containsKey(rid)) {
                                r.put("scope_name", scopeName);
                                seen.put(rid, r);
                            }
                        }
                    }
                }
            } catch (HttpClientErrorException e) {
                if (isAuthorizationError(e)) {
                    throw new GitLabApiException("GitLab rejected runner access for group " + gid
                            + " in environment '" + cfg.name() + "' (" + e.getStatusCode() + ")", e);
                }
                if (topLevel) {
                    throw new GitLabApiException("Unable to read group " + localGroupId
                            + " in environment '" + cfg.name() + "' (" + e.getStatusCode() + ")", e);
                }
                log.debug("Runner fetch skipped for subgroup {}: {}", gid, e.getStatusCode());
            } catch (Exception e) {
                if (topLevel) {
                    throw new GitLabApiException("Runner fetch failed for group " + localGroupId
                            + " in environment '" + cfg.name() + "': " + getSafeMessage(e), e);
                }
                log.debug("Runner fetch group {}: {}", gid, e.getMessage());
            }
        }
        List<Map<String, Object>> enriched = new ArrayList<>(seen.size());
        for (Map.Entry<Long, Map<String, Object>> entry : seen.entrySet()) {
            enriched.add(enrichRunner(rt, cfg.url(), entry.getKey(), entry.getValue()));
        }
        return enriched;
    }

    private boolean isAuthorizationError(HttpClientErrorException e) {
        int code = e.getStatusCode().value();
        return code == 401 || code == 403;
    }

    private Map<String, Object> enrichRunner(RestTemplate rt, String baseUrl, long runnerId,
                                              Map<String, Object> summary) {
        Map<String, Object> runner = new LinkedHashMap<>(summary);
        try {
            Map<String, Object> details = fetchObject(rt, baseUrl, "/runners/" + runnerId);
            if (!details.isEmpty()) {
                String scopeName = val(runner, "scope_name");
                runner.putAll(details);
                runner.put("scope_name", scopeName);
                // Group listing is the most current source for runtime state.
                for (String key : List.of("paused", "is_shared", "online", "runner_type",
                        "status", "job_execution_status")) {
                    if (summary.containsKey(key)) runner.put(key, summary.get(key));
                }
            }
        } catch (Exception e) {
            log.debug("Runner detail fetch {}: {}", runnerId, getSafeMessage(e));
        }

        if (val(runner, "ip_address").isBlank()) {
            try {
                List<Map<String, Object>> managers = fetchPage(rt, baseUrl,
                        "/runners/" + runnerId + "/managers?per_page=100");
                LinkedHashSet<String> addresses = new LinkedHashSet<>();
                managers.stream()
                        .sorted((a, b) -> val(b, "contacted_at").compareTo(val(a, "contacted_at")))
                        .map(manager -> val(manager, "ip_address"))
                        .filter(address -> !address.isBlank())
                        .forEach(addresses::add);
                runner.put("ip_address", String.join(", ", addresses));
            } catch (Exception e) {
                log.debug("Runner manager fetch {}: {}", runnerId, getSafeMessage(e));
            }
        }

        try {
            runner.put("current_jobs", fetchPage(rt, baseUrl,
                    "/runners/" + runnerId + "/jobs?status=running&order_by=id&sort=desc&per_page=100"));
        } catch (Exception e) {
            log.debug("Active jobs fetch for runner {}: {}", runnerId, getSafeMessage(e));
        }
        return runner;
    }

    private List<Long> getGroupChain(RestTemplate rt, String baseUrl, long groupId) {
        List<Long> groups = new ArrayList<>();
        groups.add(groupId);
        try {
            List<Map<String, Object>> desc = fetchPage(rt, baseUrl,
                    "/groups/" + groupId + "/descendant_groups?per_page=100");
            if (desc != null) {
                for (Map<String, Object> d : desc) {
                    if (d.get("id") instanceof Number)
                        groups.add(((Number) d.get("id")).longValue());
                }
            }
        } catch (HttpClientErrorException e) {
            if (isAuthorizationError(e)) {
                throw new GitLabApiException("GitLab rejected group access for " + groupId
                        + " (" + e.getStatusCode() + ")", e);
            }
            log.debug("Subgroup discovery for group {} returned {}: continuing with top group only",
                    groupId, e.getStatusCode());
        } catch (Exception e) { /* ignore */ }
        return groups;
    }

    // ─── Members ───────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getGroupMembers(long groupId) {
        return doFetchWithRetry("/groups/" + groupId + "/members/all?per_page=100&include_inherited_members=true",
                "group " + groupId + " members");
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getGroupMembers(long groupId, long namespaceId) {
        return doFetchWithRetry("/groups/" + groupId + "/members/all?per_page=100&include_inherited_members=true",
                "group " + groupId + " members", namespaceId);
    }

    /** Returns the deduplicated union of members from a group and all descendants. */
    public List<Map<String, Object>> getGroupMembersRecursive(long groupId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clients.get(0);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());
        Map<Long, Map<String, Object>> users = new LinkedHashMap<>();
        Set<Long> visited = new LinkedHashSet<>();
        for (long currentGroupId : getGroupChain(rt, cfg.url(), groupId)) {
            if (!visited.add(currentGroupId)) continue;
            try {
                List<Map<String, Object>> members = getGroupMembers(currentGroupId);
                for (Map<String, Object> member : members) {
                    Object id = member.get("id");
                    if (id instanceof Number number) users.putIfAbsent(number.longValue(), member);
                }
            } catch (Exception e) {
                log.warn("Member fetch failed for descendant group {}: {}", currentGroupId, e.getMessage());
            }
        }
        return new ArrayList<>(users.values());
    }

    /** Returns the deduplicated union of members from a group and all descendants, using the correct environment. */
    public List<Map<String, Object>> getGroupMembersRecursive(long groupId, long namespaceId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clientForNamespace(clients, namespaceId);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());
        Map<Long, Map<String, Object>> users = new LinkedHashMap<>();
        Set<Long> visited = new LinkedHashSet<>();
        for (long currentGroupId : getGroupChain(rt, cfg.url(), groupId)) {
            if (!visited.add(currentGroupId)) continue;
            try {
                List<Map<String, Object>> members = getGroupMembers(currentGroupId, namespaceId);
                for (Map<String, Object> member : members) {
                    Object id = member.get("id");
                    if (id instanceof Number number) users.putIfAbsent(number.longValue(), member);
                }
            } catch (Exception e) {
                log.warn("Member fetch failed for descendant group {}: {}", currentGroupId, e.getMessage());
            }
        }
        return new ArrayList<>(users.values());
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getProjectMembers(long projectId) {
        return doFetchWithRetry("/projects/" + projectId + "/members/all?per_page=100&include_inherited_members=true",
                "project " + projectId + " members");
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getProjectMembers(long projectId, long namespaceId) {
        return doFetchWithRetry("/projects/" + projectId + "/members/all?per_page=100&include_inherited_members=true",
                "project " + projectId + " members", namespaceId);
    }

    // ─── Events ────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getProjectEvents(long projectId, String after) {
        StringBuilder path = new StringBuilder("/projects/" + projectId + "/events?per_page=100");
        if (after != null && !after.isEmpty()) path.append("&after=").append(after);
        return doFetchWithRetry(path.toString(), "project " + projectId + " events");
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getProjectEvents(long projectId, String after, long namespaceId) {
        StringBuilder path = new StringBuilder("/projects/" + projectId + "/events?per_page=100");
        if (after != null && !after.isEmpty()) path.append("&after=").append(after);
        return doFetchWithRetry(path.toString(), "project " + projectId + " events", namespaceId);
    }

    // ─── Issues ────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getProjectIssues(long projectId, String createdAfter) {
        StringBuilder path = new StringBuilder("/projects/" + projectId + "/issues?per_page=100&scope=all");
        if (createdAfter != null && !createdAfter.isEmpty()) path.append("&created_after=").append(createdAfter);
        return doFetchWithRetry(path.toString(), "project " + projectId + " issues");
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getProjectIssues(long projectId, String createdAfter, long namespaceId) {
        StringBuilder path = new StringBuilder("/projects/" + projectId + "/issues?per_page=100&scope=all");
        if (createdAfter != null && !createdAfter.isEmpty()) path.append("&created_after=").append(createdAfter);
        return doFetchWithRetry(path.toString(), "project " + projectId + " issues", namespaceId);
    }

    // ─── Core: fetch all pages ─────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchPage(RestTemplate rt, String baseUrl, String path) {
        String apiBase = baseUrl.endsWith("/api/v4") ? baseUrl : baseUrl + "/api/v4";
        List<Map<String, Object>> result = new ArrayList<>();
        String basePath = path.split("\\?")[0];
        String queryPart = path.split("\\?").length > 1 ? path.split("\\?")[1] : "";
        String fullPath = basePath + "?" + queryPart;
        String fullUrl = apiBase + fullPath;

        ResponseEntity<String> response = rt.getForEntity(fullUrl, String.class);
        if (response.getBody() == null) return result;

        parseBodyIntoResult(response.getBody(), result);

        String tp = response.getHeaders().getFirst("x-total-pages");
        int totalPages = 1;
        try { totalPages = Math.max(1, Integer.parseInt(tp != null ? tp : "1")); }
        catch (NumberFormatException ignored) {}

        for (int p = 2; p <= totalPages; p++) {
            try {
                Thread.sleep(50);
                // Remove old page param and add new one
                String[] qpParts = queryPart.split("&");
                StringBuilder newQp = new StringBuilder();
                boolean hasPage = false;
                for (String part : qpParts) {
                    if (!hasPage && part.startsWith("page=")) {
                        newQp.append("page=").append(p);
                        hasPage = true;
                    } else {
                        if (newQp.length() > 0) newQp.append("&");
                        newQp.append(part);
                    }
                }
                if (!hasPage) {
                    if (newQp.length() > 0) newQp.append("&");
                    newQp.append("page=").append(p);
                }
                String pageUrl = apiBase + basePath + "?" + newQp.toString();

                ResponseEntity<String> resp = rt.getForEntity(pageUrl, String.class);
                if (resp.getBody() != null) {
                    parseBodyIntoResult(resp.getBody(), result);
                }
            } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
            catch (RestClientException e) {
                log.warn("Page fetch failed: {}", e.getMessage());
                break;
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private void parseBodyIntoResult(String body, List<Map<String, Object>> result) {
        try {
            Object parsed = objectMapper.readValue(body, Object.class);
            if (parsed instanceof List) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> items = (List<Map<String, Object>>) parsed;
                result.addAll(items);
            } else if (parsed instanceof Map) {
                Map<String, Object> map = (Map<String, Object>) parsed;
                Object dataObj = map.get("data");
                if (dataObj instanceof List) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> items = (List<Map<String, Object>>) dataObj;
                    result.addAll(items);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse GitLab response: {}", e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchObject(RestTemplate rt, String baseUrl, String path) {
        String apiBase = baseUrl.endsWith("/api/v4") ? baseUrl : baseUrl + "/api/v4";
        ResponseEntity<String> response = rt.getForEntity(apiBase + path, String.class);
        if (response.getBody() == null || response.getBody().isBlank()) return Collections.emptyMap();
        try {
            Object parsed = objectMapper.readValue(response.getBody(), Object.class);
            return parsed instanceof Map<?, ?> map ? (Map<String, Object>) map : Collections.emptyMap();
        } catch (IOException e) {
            log.warn("Failed to parse GitLab object response: {}", e.getMessage());
            return Collections.emptyMap();
        }
    }

    // ─── Retry wrapper ─────────────────────────────────────────

    private List<Map<String, Object>> doFetchWithRetry(String path, String label) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clients.get(0);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());

        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                List<Map<String, Object>> result = fetchPage(rt, cfg.url(), path);
                return result != null ? result : Collections.emptyList();
            } catch (RestClientException e) {
                String msg = e.getMessage();
                String statusClass = classifyError(msg);
                boolean retryable = msg == null || !msg.contains("401") && !msg.contains("403");
                if (retryable) {
                    syncMetrics.recordGitlabRetry();
                }
                if (!retryable || attempt + 1 >= maxAttempts) {
                    syncMetrics.recordGitlabError(statusClass);
                    throw new GitLabApiException(label + ": " + getSafeMessage(e));
                }
                log.debug("{} attempt {}/{}: {}", label, attempt + 1, maxAttempts, getSafeMessage(e));
                sleepBackoff(attempt);
            }
        }
        return Collections.emptyList();
    }

    private List<Map<String, Object>> doFetchWithRetry(String path, String label, long namespaceId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        if (clients.isEmpty()) return Collections.emptyList();
        EnvironmentClientConfig cfg = clientForNamespace(clients, namespaceId);
        RestTemplate rt = makeRt(cfg.url(), cfg.token());

        for (int attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                List<Map<String, Object>> result = fetchPage(rt, cfg.url(), path);
                return result != null ? result : Collections.emptyList();
            } catch (RestClientException e) {
                String msg = e.getMessage();
                String statusClass = classifyError(msg);
                boolean retryable = msg == null || !msg.contains("401") && !msg.contains("403");
                if (retryable) {
                    syncMetrics.recordGitlabRetry();
                }
                if (!retryable || attempt + 1 >= maxAttempts) {
                    syncMetrics.recordGitlabError(statusClass);
                    throw new GitLabApiException(label + ": " + getSafeMessage(e));
                }
                log.debug("{} attempt {}/{}: {}", label, attempt + 1, maxAttempts, getSafeMessage(e));
                sleepBackoff(attempt);
            }
        }
        return Collections.emptyList();
    }

    // ─── Environment routing ───────────────────────────────────

    /**
     * Find the EnvironmentClientConfig whose namespace index matches the given namespace ID.
     * Fails explicitly when no enabled environment owns the namespace — silently using
     * another environment's client/token would corrupt the fetched data.
     */
    private EnvironmentClientConfig clientForNamespace(List<EnvironmentClientConfig> clients, long namespaceId) {
        return clients.stream()
                .filter(c -> c.index() == namespaceId)
                .findFirst()
                .orElseThrow(() -> new GitLabApiException(
                        "No enabled GitLab environment is configured for namespace " + namespaceId));
    }

    /**
     * Resolve the namespace index for a GitLab environment by its database ID.
     * Throws IllegalArgumentException for unknown or disabled environments.
     */
    public long namespaceForEnvironmentId(long environmentId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        return clients.stream()
                .filter(c -> c.id() == environmentId)
                .map(EnvironmentClientConfig::index)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Unknown or disabled GitLab environment: " + environmentId));
    }

    /**
     * Return the base URL of the enabled environment that owns the namespace,
     * or {@code "none"} when no environment is configured. Safe to log: it never
     * includes the token.
     */
    public String describeClientForNamespace(long namespaceId) {
        List<EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        return clients.stream()
                .filter(c -> c.index() == namespaceId)
                .findFirst()
                .map(EnvironmentClientConfig::url)
                .orElse("none");
    }

    /**
     * Decode the namespace from a federated ID and find the matching EnvironmentClientConfig.
     */
    private EnvironmentClientConfig clientForFederatedId(List<EnvironmentClientConfig> clients, long federatedId) {
        long namespaceId = FederatedIdUtility.decode(federatedId)[0];
        return clientForNamespace(clients, namespaceId);
    }

    private String classifyError(String msg) {
        if (msg == null) return "unknown";
        if (msg.contains("401")) return "unauthorized";
        if (msg.contains("403")) return "forbidden";
        if (msg.contains("429")) return "rate_limited";
        if (msg.contains("5")) return "server_error";
        if (msg.contains("4")) return "client_error";
        return "connection_error";
    }

    private void sleepBackoff(int attempt) {
        long delay = Math.min(retryDelayMs * (1L << attempt), 32000);
        try { Thread.sleep(delay); }
        catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
    }

    private RestTemplate makeRt(String baseUrl, String token) {
        RestTemplate rt = new RestTemplate();
        rt.getInterceptors().add((request, body, execution) -> {
            request.getHeaders().set(GITLAB_TOKEN_HEADER, token);
            request.getHeaders().setAccept(List.of(MediaType.APPLICATION_JSON));
            return execution.execute(request, body);
        });
        return rt;
    }

    private String val(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v != null ? v.toString() : "";
    }

    private String getSafeMessage(Throwable e) {
        String msg = e.getMessage();
        if (msg == null) return e.getClass().getSimpleName();
        return msg.replaceAll("(?-i)(PRIVATE-TOKEN:)\\w+", "$1[REDACTED]")
                  .replaceAll("(?-i)(Bearer\\s+)[A-Za-z0-9._-]+", "$1[REDACTED]");
    }

    // ─── Exception ─────────────────────────────────────────────

    public static class GitLabApiException extends RuntimeException {
        public GitLabApiException(String message) { super(message); }
        public GitLabApiException(String message, Throwable cause) { super(message, cause); }
    }
}
