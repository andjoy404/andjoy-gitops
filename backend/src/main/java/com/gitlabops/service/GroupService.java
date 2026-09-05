package com.gitlabops.service;

import com.gitlabops.model.dto.GroupDTO;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.util.FederatedIdUtility;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class GroupService {

    private static final Logger log = LoggerFactory.getLogger(GroupService.class);

    private final EnvironmentRepository environmentRepository;

    /**
     * The group list is fetched live from each configured GitLab instance
     * (potentially many pages each), so a single call can take several seconds.
     * Both the Shell and the group picker request it, and it is re-fetched on
     * every environment/group switch and refresh. Configured groups change
     * rarely, so the fetched list is memoized with a short TTL. A cache hit
     * serves in O(names) instead of re-calling GitLab, so scope switches and
     * reloads no longer block on the upstream.
     */
    private static final long GROUPS_CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(5);

    private volatile List<GroupDTO> groupsCache;
    private volatile long groupsCacheAtMs;

    public GroupService(EnvironmentRepository environmentRepository) {
        this.environmentRepository = environmentRepository;
    }

    /** Drop the live GitLab group snapshot after environment configuration changes. */
    public synchronized void invalidateCache() {
        groupsCache = null;
        groupsCacheAtMs = 0;
    }

    @SuppressWarnings("unchecked")
    public List<GroupDTO> getAllGroups() {
        List<GroupDTO> cached = groupsCache;
        if (cached != null && System.currentTimeMillis() - groupsCacheAtMs < GROUPS_CACHE_TTL_MS) {
            return cached;
        }
        List<GroupDTO> fresh;
        synchronized (this) {
            // Re-check under the lock: another thread may have refreshed between
            // our outer check and synchronization, so use its fresher result.
            cached = groupsCache;
            if (cached != null && System.currentTimeMillis() - groupsCacheAtMs < GROUPS_CACHE_TTL_MS) {
                return cached;
            }
            fresh = fetchAllGroups();
            groupsCache = fresh;
            groupsCacheAtMs = System.currentTimeMillis();
            return fresh;
        }
    }

    @SuppressWarnings("unchecked")
    private List<GroupDTO> fetchAllGroups() {
        List<EnvironmentRepository.EnvironmentClientConfig> clients = environmentRepository.getEnabledClients();
        List<GroupDTO> allGroups = new ArrayList<>();

        for (EnvironmentRepository.EnvironmentClientConfig client : clients) {
            String envName = client.name();
            int namespaceIndex = client.index();
            String baseUrl = client.url();
            String token = client.token();
            List<Long> groupIds = client.groupIds();

            if (token == null || token.isEmpty()) {
                log.warn("Skipping environment '{}': no token available", envName);
                continue;
            }

            try {
                // Environments normally configure explicit top-level group
                // IDs. Fetch those groups directly instead of paging every
                // group visible to the token and filtering afterwards. Apart
                // from being much faster after a restart, this avoids a cold
                // login being left with an empty scope when a later list page
                // is slow or unavailable.
                List<Map<String, Object>> gitlabGroups = groupIds != null && !groupIds.isEmpty()
                    ? fetchConfiguredGroups(baseUrl, token, groupIds)
                    : fetchGroupsFromGitLab(baseUrl, token, client.onlyTopLevel());
                if (gitlabGroups != null) {
                    for (Map<String, Object> gitlabGroup : gitlabGroups) {
                        if (!passesGroupFilter(gitlabGroup, groupIds)) {
                            continue;
                        }
                        addGroup(allGroups, gitlabGroup, envName, namespaceIndex);
                    }
                }
                // When the environment opts in, also expose the descendants of
                // each configured top-level group so subgroups appear in the
                // dropdown (matching the Pipelines page group search).
                if (gitlabGroups != null && client.includeSubgroups()) {
                    for (Map<String, Object> topGroup : gitlabGroups) {
                        if (!passesGroupFilter(topGroup, groupIds)) {
                            continue;
                        }
                        long topRawId = topGroup.get("id") != null ? ((Number) topGroup.get("id")).longValue() : 0;
                        if (topRawId == 0) {
                            continue;
                        }
                        for (Map<String, Object> descendant : fetchDescendantGroups(baseUrl, token, topRawId)) {
                            addGroup(allGroups, descendant, envName, namespaceIndex);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to fetch groups from environment '{}': {}",
                    envName, e.getMessage());
                // An upstream failure is not an empty environment. Surface it
                // so React Query retries instead of caching "no groups" for
                // the cache TTL and rendering a false empty state.
                throw new IllegalStateException("Failed to load groups for environment '" + envName + "'", e);
            }
        }

        allGroups.sort((a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        return allGroups;
    }

    private List<Map<String, Object>> fetchConfiguredGroups(String baseUrl, String token, List<Long> groupIds) {
        WebClient envClient = WebClient.create(baseUrl);
        List<Map<String, Object>> groups = new ArrayList<>();
        for (Long groupId : groupIds) {
            if (groupId == null || groupId <= 0) continue;
            Map<String, Object> group = envClient.get()
                .uri("/api/v4/groups/" + groupId + "?simple=true")
                .header("PRIVATE-TOKEN", token)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .block();
            if (group == null || group.get("id") == null) {
                throw new IllegalStateException("GitLab returned no data for configured group " + groupId);
            }
            groups.add(group);
        }
        return groups;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchGroupsFromGitLab(String baseUrl, String token, boolean onlyTopLevel) {
        WebClient envClient = WebClient.create(baseUrl);
        List<Map<String, Object>> allGroups = new ArrayList<>();
        int page = 1;
        int maxPages = 100; // safety cap

        while (page <= maxPages) {
            final int currentPage = page;
            try {
                String uri = "/api/v4/groups?per_page=100&order_by=id&sort=asc&simple=true"
                        + (onlyTopLevel ? "&top_level_only=true" : "")
                        + "&page=" + currentPage;

                ResponseEntity<List<Map<String, Object>>> response = envClient.get()
                    .uri(uri)
                    .header("PRIVATE-TOKEN", token)
                    .retrieve()
                    .toEntity(new ParameterizedTypeReference<List<Map<String, Object>>>() {})
                    .block();

                if (response == null || response.getBody() == null) {
                    break;
                }

                List<Map<String, Object>> body = response.getBody();
                if (body.isEmpty()) {
                    break;
                }
                allGroups.addAll(body);

                // Check x-total-pages header for pagination
                String totalPagesHeader = response.getHeaders().getFirst("x-total-pages");
                int totalPages = 1;
                try {
                    if (totalPagesHeader != null) {
                        totalPages = Integer.parseInt(totalPagesHeader);
                    }
                } catch (NumberFormatException ignored) {}

                if (page >= totalPages) {
                    break;
                }
                page++;
            } catch (Exception e) {
                log.warn("Failed to fetch groups page {} from {}: {}", currentPage, baseUrl, e.getMessage());
                throw new IllegalStateException("Failed to fetch GitLab groups page " + currentPage, e);
            }
        }

        return allGroups;
    }

    private boolean passesGroupFilter(Map<String, Object> group, List<Long> groupIds) {
        if (groupIds == null || groupIds.isEmpty()) {
            return true;
        }
        long rawId = group.get("id") != null ? ((Number) group.get("id")).longValue() : 0;
        return groupIds.contains(rawId);
    }

    private void addGroup(List<GroupDTO> allGroups, Map<String, Object> gitlabGroup,
                          String envName, int namespaceIndex) {
        try {
            long rawId = ((Number) gitlabGroup.get("id")).longValue();
            String name = String.valueOf(gitlabGroup.getOrDefault("name", ""));
            String fullPath = String.valueOf(gitlabGroup.getOrDefault("full_path", ""));

            if (fullPath.isEmpty() && !name.isEmpty()) {
                fullPath = name.toLowerCase().replace(" ", "-");
            }

            String displayName = envName + " / " + name;
            long encodedId = FederatedIdUtility.encode(namespaceIndex, rawId);
            allGroups.add(new GroupDTO(encodedId, displayName, fullPath));
        } catch (Exception e) {
            log.warn("Error processing group from environment '{}': {}",
                envName, e.getMessage());
        }
    }

    /**
     * Returns every descendant (subgroup, sub-subgroup, ...) of the given group,
     * flattened, by paging GitLab's /descendant_groups endpoint. A failure on any
     * page returns the descendants collected so far rather than aborting the whole
     * environment's group list.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchDescendantGroups(String baseUrl, String token, long groupId) {
        WebClient envClient = WebClient.create(baseUrl);
        List<Map<String, Object>> results = new ArrayList<>();
        int page = 1;
        int maxPages = 100; // safety cap

        while (page <= maxPages) {
            final int currentPage = page;
            try {
                String uri = "/api/v4/groups/" + groupId + "/descendant_groups?per_page=100&page=" + currentPage;

                ResponseEntity<List<Map<String, Object>>> response = envClient.get()
                    .uri(uri)
                    .header("PRIVATE-TOKEN", token)
                    .retrieve()
                    .toEntity(new ParameterizedTypeReference<List<Map<String, Object>>>() {})
                    .block();

                if (response == null || response.getBody() == null) {
                    break;
                }

                List<Map<String, Object>> body = response.getBody();
                if (body.isEmpty()) {
                    break;
                }
                results.addAll(body);

                String totalPagesHeader = response.getHeaders().getFirst("x-total-pages");
                int totalPages = 1;
                try {
                    if (totalPagesHeader != null) {
                        totalPages = Integer.parseInt(totalPagesHeader);
                    }
                } catch (NumberFormatException ignored) {}

                if (page >= totalPages) {
                    break;
                }
                page++;
            } catch (Exception e) {
                log.warn("Failed to fetch descendant groups page {} for group {}: {}",
                    currentPage, groupId, e.getMessage());
                break;
            }
        }

        return results;
    }
}
