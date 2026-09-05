package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;

public class AnalyticsSummary {

    @JsonProperty("window_days")
    private int windowDays;

    @JsonProperty("window_hours")
    private int windowHours;

    @JsonProperty("group_count")
    private int groupCount;

    @JsonProperty("project_count")
    private int projectCount;

    @JsonProperty("pipeline_count")
    private int pipelineCount;

    @JsonProperty("success_count")
    private int successCount;

    @JsonProperty("failed_count")
    private int failedCount;

    @JsonProperty("manual_count")
    private int manualCount;

    @JsonProperty("active_count")
    private int activeCount;

    @JsonProperty("canceled_count")
    private int canceledCount;

    @JsonProperty("runner_count")
    private int runnerCount;

    @JsonProperty("runner_running_count")
    private int runnerRunningCount;

    @JsonProperty("runner_idle_count")
    private int runnerIdleCount;

    @JsonProperty("runner_offline_count")
    private int runnerOfflineCount;

    @JsonProperty("runner_stale_count")
    private int runnerStaleCount;

    @JsonProperty("runner_paused_count")
    private int runnerPausedCount;

    private List<AnalyticsHistoryPoint> history;

    @JsonProperty("success_rate")
    private double successRate;

    public AnalyticsSummary() {
    }

    public AnalyticsSummary(int windowDays, int windowHours, int groupCount, int projectCount, int pipelineCount,
                            int successCount, int failedCount, int manualCount, int activeCount,
                            int canceledCount, int runnerCount, int runnerRunningCount,
                            int runnerIdleCount, int runnerOfflineCount, int runnerStaleCount,
                            int runnerPausedCount, List<AnalyticsHistoryPoint> history,
                            double successRate) {
        this.windowDays = windowDays;
        this.windowHours = windowHours;
        this.groupCount = groupCount;
        this.projectCount = projectCount;
        this.pipelineCount = pipelineCount;
        this.successCount = successCount;
        this.failedCount = failedCount;
        this.manualCount = manualCount;
        this.activeCount = activeCount;
        this.canceledCount = canceledCount;
        this.runnerCount = runnerCount;
        this.runnerRunningCount = runnerRunningCount;
        this.runnerIdleCount = runnerIdleCount;
        this.runnerOfflineCount = runnerOfflineCount;
        this.runnerStaleCount = runnerStaleCount;
        this.runnerPausedCount = runnerPausedCount;
        this.history = history;
        this.successRate = successRate;
    }

    public int getWindowDays() { return windowDays; }
    public void setWindowDays(int windowDays) { this.windowDays = windowDays; }

    public int getWindowHours() { return windowHours; }
    public void setWindowHours(int windowHours) { this.windowHours = windowHours; }

    public int getGroupCount() { return groupCount; }
    public void setGroupCount(int groupCount) { this.groupCount = groupCount; }

    public int getProjectCount() { return projectCount; }
    public void setProjectCount(int projectCount) { this.projectCount = projectCount; }

    public int getPipelineCount() { return pipelineCount; }
    public void setPipelineCount(int pipelineCount) { this.pipelineCount = pipelineCount; }

    public int getSuccessCount() { return successCount; }
    public void setSuccessCount(int successCount) { this.successCount = successCount; }

    public int getFailedCount() { return failedCount; }
    public void setFailedCount(int failedCount) { this.failedCount = failedCount; }

    public int getManualCount() { return manualCount; }
    public void setManualCount(int manualCount) { this.manualCount = manualCount; }

    public int getActiveCount() { return activeCount; }
    public void setActiveCount(int activeCount) { this.activeCount = activeCount; }

    public int getCanceledCount() { return canceledCount; }
    public void setCanceledCount(int canceledCount) { this.canceledCount = canceledCount; }

    public int getRunnerCount() { return runnerCount; }
    public void setRunnerCount(int runnerCount) { this.runnerCount = runnerCount; }

    public int getRunnerRunningCount() { return runnerRunningCount; }
    public void setRunnerRunningCount(int runnerRunningCount) { this.runnerRunningCount = runnerRunningCount; }

    public int getRunnerIdleCount() { return runnerIdleCount; }
    public void setRunnerIdleCount(int runnerIdleCount) { this.runnerIdleCount = runnerIdleCount; }

    public int getRunnerOfflineCount() { return runnerOfflineCount; }
    public void setRunnerOfflineCount(int runnerOfflineCount) { this.runnerOfflineCount = runnerOfflineCount; }

    public int getRunnerStaleCount() { return runnerStaleCount; }
    public void setRunnerStaleCount(int runnerStaleCount) { this.runnerStaleCount = runnerStaleCount; }

    public int getRunnerPausedCount() { return runnerPausedCount; }
    public void setRunnerPausedCount(int runnerPausedCount) { this.runnerPausedCount = runnerPausedCount; }

    public List<AnalyticsHistoryPoint> getHistory() { return history; }
    public void setHistory(List<AnalyticsHistoryPoint> history) { this.history = history; }

    public double getSuccessRate() { return successRate; }
    public void setSuccessRate(double successRate) { this.successRate = successRate; }
}
