package com.gitlabops.model.dto;

import java.util.List;

/**
 * Represents a GitLab project from the GitLab API response.
 */
public record GitlabProject(
    long id,
    String name,
    String path,
    String description,
    String web_url,
    String default_branch,
    boolean archived,
    boolean jobs_enabled,
    boolean public_builds,
    boolean shared_runners_enabled,
    List<String> topics,
    String namespace_path,
    long namespace_id,
    long group_id
) {
    public GitlabProject(long id, String name, String path, String description,
                         String web_url, String default_branch, boolean archived,
                         boolean jobs_enabled, boolean public_builds,
                         boolean shared_runners_enabled, List<String> topics,
                         String namespace_path, long namespace_id, long group_id) {
        this.id = id;
        this.name = name != null ? name : "";
        this.path = path != null ? path : "";
        this.description = description != null ? description : "";
        this.web_url = web_url != null ? web_url : "";
        this.default_branch = default_branch != null ? default_branch : "";
        this.archived = archived;
        this.jobs_enabled = jobs_enabled;
        this.public_builds = public_builds;
        this.shared_runners_enabled = shared_runners_enabled;
        this.topics = topics != null ? topics : List.of();
        this.namespace_path = namespace_path != null ? namespace_path : "";
        this.namespace_id = namespace_id;
        this.group_id = group_id;
    }
}
