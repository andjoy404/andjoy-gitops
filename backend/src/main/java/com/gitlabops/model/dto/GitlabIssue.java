package com.gitlabops.model.dto;

/**
 * Represents a GitLab issue for user issues sync.
 */
public record GitlabIssue(
    long id,
    long projectId,
    long authorId,
    String title,
    String state,
    String createdAt,
    String updatedAt,
    String url
) {
    public GitlabIssue(long id, long projectId, long authorId, String title, String state,
                       String createdAt, String updatedAt, String url) {
        this.id = id;
        this.projectId = projectId;
        this.authorId = authorId;
        this.title = title != null ? title : "";
        this.state = state != null ? state : "opened";
        this.createdAt = createdAt != null ? createdAt : "";
        this.updatedAt = updatedAt != null ? updatedAt : "";
        this.url = url != null ? url : "";
    }
}
