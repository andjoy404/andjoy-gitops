package com.gitlabops.model.dto;

/**
 * Represents a GitLab user event from the GitLab API.
 * Events include pushes, comments, merge_request activities, etc.
 */
public record GitlabEvent(
    long id,
    long userId,
    String actionName,
    String targetType,
    String targetTitle,
    Long targetId,
    long projectId,
    String createdAt,
    String occurredAt,
    String userName,
    String userUsername,
    String userAvatarUrl,
    String details
) {
    public GitlabEvent(long id, long userId, String actionName, String targetType,
                       String targetTitle, Long targetId, long projectId, String createdAt,
                       String occurredAt, String userName, String userUsername,
                       String userAvatarUrl, String details) {
        this.id = id;
        this.userId = userId;
        this.actionName = actionName;
        this.targetType = targetType;
        this.targetTitle = targetTitle != null ? targetTitle : "";
        this.targetId = targetId;
        this.projectId = projectId;
        this.createdAt = createdAt != null ? createdAt : "";
        this.occurredAt = occurredAt != null ? occurredAt : createdAt != null ? createdAt : "";
        this.userName = userName;
        this.userUsername = userUsername;
        this.userAvatarUrl = userAvatarUrl;
        this.details = details;
    }
}
