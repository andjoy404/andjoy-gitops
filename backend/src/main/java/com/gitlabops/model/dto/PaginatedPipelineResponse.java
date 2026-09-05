package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class PaginatedPipelineResponse {

    private int total;
    private int page;
    @JsonProperty("page_size")
    private int pageSize;

    @JsonProperty("group_id")
    private String groupId;

    private List<ProjectPipeline> projects;

    public PaginatedPipelineResponse() {
    }

    public PaginatedPipelineResponse(int total, int page, int pageSize, String groupId, List<ProjectPipeline> projects) {
        this.total = total;
        this.page = page;
        this.pageSize = pageSize;
        this.groupId = groupId;
        this.projects = projects;
    }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }

    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }

    public int getPageSize() { return pageSize; }
    public void setPageSize(int pageSize) { this.pageSize = pageSize; }

    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }

    public List<ProjectPipeline> getProjects() { return projects; }
    public void setProjects(List<ProjectPipeline> projects) { this.projects = projects; }
}
