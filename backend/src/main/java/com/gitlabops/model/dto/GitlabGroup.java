package com.gitlabops.model.dto;

/**
 * Represents a GitLab group from the GitLab API response.
 */
public record GitlabGroup(
    long id,
    String name,
    String path,
    String description,
    String full_name,
    String full_path,
    int parent_id,
    String avatar_url,
    String web_url,
    boolean shared_builds_allowed,
    int visibility_level,
    int stat_builds_count,
    int stat_projects_count,
    long web_url_value
) {
    public GitlabGroup {
        web_url_value = (web_url != null && !web_url.isEmpty()) ? web_url.hashCode() : 0;
    }
}
