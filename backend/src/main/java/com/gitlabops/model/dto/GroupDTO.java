package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class GroupDTO {

    private long id;
    private String name;
    private String fullPath;

    public GroupDTO() {
    }

    public GroupDTO(long id, String name, String fullPath) {
        this.id = id;
        this.name = name;
        this.fullPath = fullPath;
    }

    public long getId() { return id; }
    public void setId(long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    @JsonProperty("full_path")
    public String getFullPath() { return fullPath; }
    public void setFullPath(String fullPath) { this.fullPath = fullPath; }
}
