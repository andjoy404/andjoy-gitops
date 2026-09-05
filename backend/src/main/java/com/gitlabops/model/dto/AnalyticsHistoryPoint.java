package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class AnalyticsHistoryPoint {

    private String label;

    @JsonProperty("pipeline_count")
    private int pipelineCount;

    @JsonProperty("project_count")
    private int projectCount;

    public AnalyticsHistoryPoint() {
    }

    public AnalyticsHistoryPoint(String label, int pipelineCount, int projectCount) {
        this.label = label;
        this.pipelineCount = pipelineCount;
        this.projectCount = projectCount;
    }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public int getPipelineCount() { return pipelineCount; }
    public void setPipelineCount(int pipelineCount) { this.pipelineCount = pipelineCount; }

    public int getProjectCount() { return projectCount; }
    public void setProjectCount(int projectCount) { this.projectCount = projectCount; }
}
