package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;

public class EnvironmentDTO {

    private long id;

    @JsonProperty("namespace_id")
    private int namespaceId;

    private String name;

    @JsonProperty("base_url")
    private String baseUrl;

    @JsonProperty("group_ids")
    private List<Long> groupIds;

    private boolean enabled;

    @JsonProperty("only_top_level")
    private boolean onlyTopLevel;

    @JsonProperty("include_subgroups")
    private boolean includeSubgroups;

    @JsonProperty("token_configured")
    private boolean tokenConfigured;

    @JsonProperty("last_tested_at")
    private Instant lastTestedAt;

    @JsonProperty("last_error")
    private String lastError;

    @JsonProperty("is_default")
    private boolean isDefault;

    public EnvironmentDTO() {
    }

    public EnvironmentDTO(long id, int namespaceId, String name, String baseUrl,
                          List<Long> groupIds, boolean enabled, boolean onlyTopLevel,
                          boolean includeSubgroups, boolean tokenConfigured,
                          Instant lastTestedAt, String lastError, boolean isDefault) {
        this.id = id;
        this.namespaceId = namespaceId;
        this.name = name;
        this.baseUrl = baseUrl;
        this.groupIds = groupIds;
        this.enabled = enabled;
        this.onlyTopLevel = onlyTopLevel;
        this.includeSubgroups = includeSubgroups;
        this.tokenConfigured = tokenConfigured;
        this.lastTestedAt = lastTestedAt;
        this.lastError = lastError;
        this.isDefault = isDefault;
    }

    public long getId() { return id; }
    public void setId(long id) { this.id = id; }

    public int getNamespaceId() { return namespaceId; }
    public void setNamespaceId(int namespaceId) { this.namespaceId = namespaceId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public List<Long> getGroupIds() { return groupIds; }
    public void setGroupIds(List<Long> groupIds) { this.groupIds = groupIds; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public boolean isOnlyTopLevel() { return onlyTopLevel; }
    public void setOnlyTopLevel(boolean onlyTopLevel) { this.onlyTopLevel = onlyTopLevel; }

    public boolean isIncludeSubgroups() { return includeSubgroups; }
    public void setIncludeSubgroups(boolean includeSubgroups) { this.includeSubgroups = includeSubgroups; }

    public boolean isTokenConfigured() { return tokenConfigured; }
    public void setTokenConfigured(boolean tokenConfigured) { this.tokenConfigured = tokenConfigured; }

    public Instant getLastTestedAt() { return lastTestedAt; }
    public void setLastTestedAt(Instant lastTestedAt) { this.lastTestedAt = lastTestedAt; }

    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }

    public boolean isIsDefault() { return isDefault; }
    public void setIsDefault(boolean isDefault) { this.isDefault = isDefault; }
}
