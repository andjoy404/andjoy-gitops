package com.gitlabops.service;

import com.gitlabops.config.AnalyticsProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Background synchronous scheduler.
 *
 * <p>Runs the full GitLab synchronization on a configurable schedule.
 * Uses a volatile mutex to prevent overlapping syncs for the same run.</p>
 *
 * <p>If one environment fails, others will still sync — the sync loop
 * catches exceptions per-environment and continues.</p>
 */
@Component
@ConditionalOnProperty(name = "analytics.enabled", havingValue = "true", matchIfMissing = true)
public class SyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(SyncScheduler.class);
    private static final Object SYNC_MUTEX = new Object();

    private final AnalyticsSyncService syncService;
    private final long syncIntervalMs;
    private final AnalyticsProperties analyticsProperties;
    private boolean initialized = false;

    public SyncScheduler(AnalyticsSyncService syncService,
                         AnalyticsProperties analyticsProperties) {
        this.syncService = syncService;
        this.analyticsProperties = analyticsProperties;
        this.syncIntervalMs = analyticsProperties.getSyncIntervalSeconds() * 1000L;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        log.info("Application fully initialized, sync scheduler active (interval={}s = {}ms)",
                analyticsProperties.getSyncIntervalSeconds(), syncIntervalMs);
        synchronized (SYNC_MUTEX) {
            initialized = true;
        }
    }

    /**
     * Scheduled sync task.
     *
     * <p>Fixed delay to prevent overlap. The mutex ensures that
     * if a sync takes longer than the interval, the next cycle
     * will be skipped.</p>
     */
    @Scheduled(fixedDelayString = "#{${analytics.sync-interval-seconds:60} * 1000}")
    public void scheduledSync() {
        synchronized (SYNC_MUTEX) {
            if (!initialized) {
                log.debug("Sync scheduler not initialized yet, skipping");
                return;
            }
            if (syncService.isSyncRunning()) {
                log.debug("Sync already in progress, skipping this interval");
                return;
            }
            try {
                log.debug("Starting scheduled sync");
                AnalyticsSyncService.SyncResult result = syncService.syncAll();
                if (result.success()) {
                    log.info("Scheduled sync completed: {} projects, {} pipelines, {} jobs",
                            result.projectsSynced(), result.pipelinesSynced(), result.jobsSynced());
                } else {
                    log.warn("Scheduled sync completed with errors: {}", result.message());
                }
            } catch (Exception e) {
                String safeMessage = e.getMessage();
                if (safeMessage != null) {
                    safeMessage = safeMessage.replaceAll("(?-i)(PRIVATE-TOKEN:)\\w+", "$1[REDACTED]");
                }
                log.error("Scheduled sync failed: {}", safeMessage != null ? safeMessage : "Unknown error", e);
            }
        }
    }
}
