package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

public class UserProjectRelation {

    private long userId;
    private long projectId;
    private long groupId;

    @JsonProperty("synced_at")
    private Instant syncedAt;

    public UserProjectRelation() {}

    public long getUserId() { return userId; }
    public void setUserId(long userId) { this.userId = userId; }

    public long getProjectId() { return projectId; }
    public void setProjectId(long projectId) { this.projectId = projectId; }

    public long getGroupId() { return groupId; }
    public void setGroupId(long groupId) { this.groupId = groupId; }

    public Instant getSyncedAt() { return syncedAt; }
    public void setSyncedAt(Instant syncedAt) { this.syncedAt = syncedAt; }
}
