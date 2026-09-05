package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

public class AnalyticsReadiness {

    private boolean ready;

    @JsonProperty("data_available")
    private boolean dataAvailable;

    private String message;

    @JsonProperty("last_completed_at")
    private Instant lastCompletedAt;

    @JsonProperty("scoped_syncing")
    private Boolean scopedSyncing;

    @JsonProperty("scoped_error")
    private String scopedError;

    @JsonProperty("project_count")
    private int projectCount;

    @JsonProperty("pipeline_count")
    private int pipelineCount;

    @JsonProperty("runner_state_count")
    private int runnerStateCount;

    @JsonProperty("user_count")
    private int userCount;

    @JsonProperty("user_event_count")
    private int userEventCount;

    @JsonProperty("user_issue_count")
    private int userIssueCount;

    public AnalyticsReadiness() {
    }

    public AnalyticsReadiness(boolean ready, boolean dataAvailable, String message,
                              Instant lastCompletedAt, int projectCount, int pipelineCount,
                              int runnerStateCount, int userCount, int userEventCount,
                              int userIssueCount) {
        this.ready = ready;
        this.dataAvailable = dataAvailable;
        this.message = message;
        this.lastCompletedAt = lastCompletedAt;
        this.projectCount = projectCount;
        this.pipelineCount = pipelineCount;
        this.runnerStateCount = runnerStateCount;
        this.userCount = userCount;
        this.userEventCount = userEventCount;
        this.userIssueCount = userIssueCount;
    }

    public boolean isReady() { return ready; }

    /** Adds the scoped-refresh (single-group) sync signals to a readiness payload. */
    public AnalyticsReadiness withScopedSync(Boolean scopedSyncing, String scopedError) {
        this.scopedSyncing = scopedSyncing;
        this.scopedError = scopedError;
        return this;
    }

    public Boolean getScopedSyncing() { return scopedSyncing; }
    public void setScopedSyncing(Boolean scopedSyncing) { this.scopedSyncing = scopedSyncing; }

    public String getScopedError() { return scopedError; }
    public void setScopedError(String scopedError) { this.scopedError = scopedError; }

    public void setReady(boolean ready) { this.ready = ready; }

    public boolean isDataAvailable() { return dataAvailable; }
    public void setDataAvailable(boolean dataAvailable) { this.dataAvailable = dataAvailable; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public Instant getLastCompletedAt() { return lastCompletedAt; }
    public void setLastCompletedAt(Instant lastCompletedAt) { this.lastCompletedAt = lastCompletedAt; }

    public int getProjectCount() { return projectCount; }
    public void setProjectCount(int projectCount) { this.projectCount = projectCount; }

    public int getPipelineCount() { return pipelineCount; }
    public void setPipelineCount(int pipelineCount) { this.pipelineCount = pipelineCount; }

    public int getRunnerStateCount() { return runnerStateCount; }
    public void setRunnerStateCount(int runnerStateCount) { this.runnerStateCount = runnerStateCount; }

    public int getUserCount() { return userCount; }
    public void setUserCount(int userCount) { this.userCount = userCount; }

    public int getUserEventCount() { return userEventCount; }
    public void setUserEventCount(int userEventCount) { this.userEventCount = userEventCount; }

    public int getUserIssueCount() { return userIssueCount; }
    public void setUserIssueCount(int userIssueCount) { this.userIssueCount = userIssueCount; }
}
