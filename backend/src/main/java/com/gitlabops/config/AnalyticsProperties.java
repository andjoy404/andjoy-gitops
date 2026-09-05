package com.gitlabops.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "analytics")
public class AnalyticsProperties {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsProperties.class);

    private boolean enabled;
    private int syncIntervalSeconds;
    private int retentionDays = 30;
    private boolean syncUsers = true;
    private String pipelineHistoryDays = "30";

    @PostConstruct
    void init() {
        if (syncIntervalSeconds <= 0) {
            syncIntervalSeconds = 60;
        }
        log.info("Analytics sync interval configured: {} seconds", syncIntervalSeconds);
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public int getSyncIntervalSeconds() { return syncIntervalSeconds; }
    public void setSyncIntervalSeconds(int syncIntervalSeconds) { this.syncIntervalSeconds = syncIntervalSeconds; }

    public int getRetentionDays() { return retentionDays; }
    public void setRetentionDays(int retentionDays) { this.retentionDays = retentionDays; }

    public boolean isSyncUsers() { return syncUsers; }
    public void setSyncUsers(boolean syncUsers) { this.syncUsers = syncUsers; }

    public String getPipelineHistoryDays() { return pipelineHistoryDays; }
    public void setPipelineHistoryDays(String pipelineHistoryDays) { this.pipelineHistoryDays = pipelineHistoryDays; }
}
