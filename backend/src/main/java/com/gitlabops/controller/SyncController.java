package com.gitlabops.controller;

import com.gitlabops.service.AnalyticsSyncService;
import com.gitlabops.service.AnalyticsSyncService.SyncResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Controller for manual GitLab synchronization.
 * Admin-only endpoint that triggers the full sync pipeline.
 */
@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private static final Logger log = LoggerFactory.getLogger(SyncController.class);

    private final AnalyticsSyncService syncService;

    public SyncController(AnalyticsSyncService syncService) {
        this.syncService = syncService;
    }

    /**
     * Trigger a full synchronization.
     * Uses the same sync logic as the background scheduler.
     *
     * @return SyncResult as JSON
     */
    @PostMapping("/trigger")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<SyncResult> triggerSync() {
        log.info("Manual sync triggered by admin");
        try {
            SyncResult result = syncService.triggerManualSync();
            if (result.success()) {
                return ResponseEntity.ok(result);
            } else {
                return ResponseEntity.status(500).body(result);
            }
        } catch (Exception e) {
            String safeMessage = e.getMessage() != null ?
                    e.getMessage().replaceAll("(?-i)(PRIVATE-TOKEN:)\\w+", "$1[REDACTED]") : "Unknown error";
            return ResponseEntity.status(500)
                    .body(new SyncResult(false, safeMessage, 0, 0, 0, 0));
        }
    }

    /**
     * Check current sync status.
     */
    @PostMapping("/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'EDITOR')")
    public ResponseEntity<Map<String, Object>> syncStatus() {
        boolean running = syncService.isSyncRunning();
        String status = running ? "syncing" : "idle";
        return ResponseEntity.ok(Map.of(
                "syncing", running,
                "status", status,
                "next_sync_interval", 60
        ));
    }

    /**
     * Trigger a scoped, on-demand refresh for one environment + group on behalf of
     * the page that asked for it (Pipelines Refresh button).
     *
     * <p>{@code group_id} is the group's federated id, exactly as the frontend
     * holds it ({@code (namespace_id << 44) | native_id}); the service validates
     * it against the environment and decodes it to the native id for GitLab.
     * Repeated clicks while the refresh is in flight return a {@code rejected}
     * status without double-fetching. The response body is
     * {@code {triggered, in_progress, message}} so the frontend can drive its
     * readiness polling from the outcome rather than blocking on the sync.</p>
     */
    @PostMapping("/refresh")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> scopedRefresh(
            @RequestParam("environment_id") long environmentId,
            @RequestParam("group_id") long groupId) {
        log.info("Scoped refresh requested env={} group={}", environmentId, groupId);
        String outcome = syncService.refreshScope(environmentId, groupId);
        boolean accepted = outcome.equals("accepted");
        String message = accepted ? "accepted" : outcome.startsWith("rejected:") ? outcome.substring("rejected:".length()) : outcome;
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("triggered", accepted);
        body.put("in_progress", syncService.isScopedRefreshInFlight(environmentId, groupId));
        body.put("message", message);
        return ResponseEntity.ok(body);
    }
}
