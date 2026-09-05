package com.gitlabops.model.dto;

/**
 * Represents a sync state entry for tracking synchronization progress.
 */
public record SyncState(
    String scope,
    Long lastStartedAt,
    Long lastCompletedAt,
    String lastError
) {
    public SyncState {
        if (scope == null) scope = "pipelines";
    }
}
