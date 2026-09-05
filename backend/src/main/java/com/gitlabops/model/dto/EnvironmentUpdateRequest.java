package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.hibernate.validator.constraints.URL;

import java.util.ArrayList;
import java.util.List;

public class EnvironmentUpdateRequest {

    @JsonProperty("name")
    @NotBlank(message = "Name is required")
    @Size(min = 1, message = "Name must not be empty")
    private String name;

    @JsonProperty("base_url")
    @NotBlank(message = "GitLab URL is required")
    @URL(message = "GitLab URL must be valid")
    private String baseUrl;

    @JsonProperty("token")
    private String token;

    @JsonProperty("group_ids")
    private List<Long> groupIds = new ArrayList<>();

    @JsonProperty("enabled")
    private boolean enabled = true;

    @JsonProperty("only_top_level")
    private boolean onlyTopLevel = true;

    @JsonProperty("include_subgroups")
    private boolean includeSubgroups = true;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public List<Long> getGroupIds() { return groupIds; }
    public void setGroupIds(List<Long> groupIds) { this.groupIds = groupIds; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public boolean isOnlyTopLevel() { return onlyTopLevel; }
    public void setOnlyTopLevel(boolean onlyTopLevel) { this.onlyTopLevel = onlyTopLevel; }

    public boolean isIncludeSubgroups() { return includeSubgroups; }
    public void setIncludeSubgroups(boolean includeSubgroups) { this.includeSubgroups = includeSubgroups; }
}
