package com.gitlabops.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "gitlab")
public class GitlabProperties {

    private String apiBaseUrl = "https://gitlab.com";
    private int apiTimeoutSeconds = 30;

    public String getApiBaseUrl() { return apiBaseUrl; }
    public void setApiBaseUrl(String apiBaseUrl) { this.apiBaseUrl = apiBaseUrl; }

    public int getApiTimeoutSeconds() { return apiTimeoutSeconds; }
    public void setApiTimeoutSeconds(int apiTimeoutSeconds) { this.apiTimeoutSeconds = apiTimeoutSeconds; }
}
