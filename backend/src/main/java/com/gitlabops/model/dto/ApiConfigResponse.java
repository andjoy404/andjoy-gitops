package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class ApiConfigResponse {

    @JsonProperty("api_version")
    private String apiVersion;

    @JsonProperty("read_only")
    private boolean readOnly;

    @JsonProperty("hide_write_actions")
    private boolean hideWriteActions;

    @JsonProperty("default_page_size")
    private int defaultPageSize;

    @JsonProperty("pipeline_history_days")
    private int pipelineHistoryDays;

    @JsonProperty("analytics_retention_days")
    private int analyticsRetentionDays;

    @JsonProperty("page_size_options")
    private java.util.List<Integer> pageSizeOptions;

    public ApiConfigResponse() {}

    public ApiConfigResponse(String apiVersion, boolean readOnly, boolean hideWriteActions,
                             int defaultPageSize, int pipelineHistoryDays,
                             int analyticsRetentionDays, java.util.List<Integer> pageSizeOptions) {
        this.apiVersion = apiVersion;
        this.readOnly = readOnly;
        this.hideWriteActions = hideWriteActions;
        this.defaultPageSize = defaultPageSize;
        this.pipelineHistoryDays = pipelineHistoryDays;
        this.analyticsRetentionDays = analyticsRetentionDays;
        this.pageSizeOptions = pageSizeOptions;
    }

    public String getApiVersion() { return apiVersion; }
    public void setApiVersion(String apiVersion) { this.apiVersion = apiVersion; }

    public boolean isReadOnly() { return readOnly; }
    public void setReadOnly(boolean readOnly) { this.readOnly = readOnly; }

    public boolean isHideWriteActions() { return hideWriteActions; }
    public void setHideWriteActions(boolean hideWriteActions) { this.hideWriteActions = hideWriteActions; }

    public int getDefaultPageSize() { return defaultPageSize; }
    public void setDefaultPageSize(int defaultPageSize) { this.defaultPageSize = defaultPageSize; }

    public int getPipelineHistoryDays() { return pipelineHistoryDays; }
    public void setPipelineHistoryDays(int pipelineHistoryDays) { this.pipelineHistoryDays = pipelineHistoryDays; }

    public int getAnalyticsRetentionDays() { return analyticsRetentionDays; }
    public void setAnalyticsRetentionDays(int analyticsRetentionDays) { this.analyticsRetentionDays = analyticsRetentionDays; }

    public java.util.List<Integer> getPageSizeOptions() { return pageSizeOptions; }
    public void setPageSizeOptions(java.util.List<Integer> pageSizeOptions) { this.pageSizeOptions = pageSizeOptions; }
}
