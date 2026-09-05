package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

import java.util.List;

public class EnvironmentCreateRequest {

    @NotBlank(message = "Environment name is required")
    @Size(max = 255, message = "Name must be 255 characters or fewer")
    private String name;

    @NotBlank(message = "GitLab URL is required")
    @Size(max = 1000, message = "Base URL must be 1000 characters or fewer")
    @JsonProperty("base_url")
    private String base_url;

    @Size(min = 1, max = 255, message = "Token is required")
    private String token;

    @JsonProperty("group_ids")
    private List<Long> group_ids;

    private Boolean enabled = true;
    private Boolean only_top_level = true;
    private Boolean include_subgroups = true;
    private Boolean is_default = false;

    public @NotBlank @Size(max = 255) String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public @NotBlank @Size(max = 1000) String getBaseUrl() { return base_url; }
    public void setBaseUrl(String base_url) { this.base_url = base_url; }

    public @Size(min = 1, max = 255) String getToken() { return token; }
    public void setToken(String token) { this.token = token; }

    public List<Long> getGroupIds() { return group_ids; }
    public void setGroupIds(List<Long> group_ids) { this.group_ids = group_ids; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }

    public Boolean getOnlyTopLevel() { return only_top_level; }
    public void setOnlyTopLevel(Boolean only_top_level) { this.only_top_level = only_top_level; }

    public Boolean getIncludeSubgroups() { return include_subgroups; }
    public void setIncludeSubgroups(Boolean include_subgroups) { this.include_subgroups = include_subgroups; }

    public Boolean getIs_default() { return is_default; }
    public void setIs_default(Boolean is_default) { this.is_default = is_default; }

    public boolean isEnabled() { return enabled != null && enabled; }
    public boolean isOnlyTopLevel() { return only_top_level != null && only_top_level; }
    public boolean isIncludeSubgroups() { return include_subgroups != null && include_subgroups; }
}
