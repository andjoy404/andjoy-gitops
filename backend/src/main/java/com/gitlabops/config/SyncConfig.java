package com.gitlabops.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enable Spring's @Scheduled annotation support for the sync scheduler.
 */
@Configuration
@EnableScheduling
public class SyncConfig {
}
