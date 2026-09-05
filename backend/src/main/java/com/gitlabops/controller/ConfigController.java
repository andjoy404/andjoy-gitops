package com.gitlabops.controller;

import com.gitlabops.config.AnalyticsProperties;
import com.gitlabops.config.UiProperties;
import com.gitlabops.model.dto.ApiConfigResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.info.BuildProperties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

@RestController
@RequestMapping("/api")
public class ConfigController {

    private static final String APP_NAME = "andjoy-gitops";

    private final UiProperties uiProps;
    private final AnalyticsProperties analyticsProps;
    private final BuildProperties buildProperties;
    private final Properties buildInfo;

    public ConfigController(UiProperties uiProps, AnalyticsProperties analyticsProps,
                            @Nullable BuildProperties buildProperties) {
        this.uiProps = uiProps;
        this.analyticsProps = analyticsProps;
        this.buildProperties = buildProperties;
        Properties info = new Properties();
        try {
            ClassPathResource resource = new ClassPathResource("build-info.properties");
            if (resource.exists()) {
                try (var is = resource.getInputStream()) {
                    info.load(is);
                }
            }
        } catch (IOException e) {
            // will use fallback defaults
        }
        this.buildInfo = info;
    }

    @GetMapping("/config")
    public ApiConfigResponse getConfig() {
        String version = resolveVersion();

        return new ApiConfigResponse(
                version,
                uiProps.isReadOnly(),
                uiProps.isHideWriteActions(),
                uiProps.getDefaultPageSize(),
                90,
                analyticsProps.getRetentionDays(),
                uiProps.getPageSizeOptions()
        );
    }

    private String resolveVersion() {
        if (buildInfo != null && !buildInfo.isEmpty()) {
            String v = buildInfo.getProperty("build.version");
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        if (buildProperties != null) {
            return buildProperties.getVersion();
        }
        return "1.0.0-rc.1";
    }

    /**
     * Exposes application version and build metadata.
     * Safe for public access — no secrets included.
     */
    @GetMapping("/version")
    public Map<String, String> getBuildInfo() {
        Map<String, String> info = new HashMap<>();
        String version = resolveVersion();
        info.put("name", APP_NAME);
        info.put("version", version);
        info.put("commit", resolveCommit());
        info.put("buildTime", resolveBuildTime());
        return info;
    }

    private String resolveCommit() {
        if (buildInfo != null) {
            String v = buildInfo.getProperty("build.git.commit.id");
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        String env = System.getenv("COMMIT_SHA");
        if (env != null && !env.isEmpty()) {
            return env;
        }
        return "unknown";
    }

    private String resolveBuildTime() {
        if (buildInfo != null) {
            String v = buildInfo.getProperty("build.time");
            if (v != null && !v.isEmpty()) {
                return v;
            }
        }
        if (buildProperties != null) {
            return String.valueOf(buildProperties.getTime());
        }
        return "unknown";
    }
}
