package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class GraphNode {

    @JsonProperty("id")
    private String id;
    @JsonProperty("type")
    private String type;
    @JsonProperty("label")
    private String label;
    @JsonProperty("secondary_label")
    private String secondaryLabel;
    @JsonProperty("status")
    private String status;
    @JsonProperty("avatar_url")
    private String avatarUrl;
    @JsonProperty("web_url")
    private String webUrl;
    @JsonProperty("path_with_ns")
    private String pathWithNs;
    @JsonProperty("pipeline_count")
    private Integer pipelineCount;
    @JsonProperty("default_branch")
    private String defaultBranch;
    @JsonProperty("pipeline_id")
    private Long pipelineId;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getSecondaryLabel() { return secondaryLabel; }
    public void setSecondaryLabel(String secondaryLabel) { this.secondaryLabel = secondaryLabel; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public String getWebUrl() { return webUrl; }
    public void setWebUrl(String webUrl) { this.webUrl = webUrl; }

    public String getPathWithNs() { return pathWithNs; }
    public void setPathWithNs(String pathWithNs) { this.pathWithNs = pathWithNs; }

    public Integer getPipelineCount() { return pipelineCount; }
    public void setPipelineCount(Integer pipelineCount) { this.pipelineCount = pipelineCount; }

    public String getDefaultBranch() { return defaultBranch; }
    public void setDefaultBranch(String defaultBranch) { this.defaultBranch = defaultBranch; }

    public Long getPipelineId() { return pipelineId; }
    public void setPipelineId(Long pipelineId) { this.pipelineId = pipelineId; }
}
