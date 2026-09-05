package com.gitlabops.config;

import jakarta.annotation.PostConstruct;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;

@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true", matchIfMissing = true)
public class FlywayConfig {

    private static final Logger log = LoggerFactory.getLogger(FlywayConfig.class);

    @Value("${spring.datasource.url}")
    private String url;

    @Value("${spring.datasource.username}")
    private String username;

    @Value("${spring.datasource.password}")
    private String password;

    /**
     * Create Flyway configuration bean with baseline-to-99 strategy.
     * This bean is disabled during unit tests (flyway.enabled=false)
     * and enabled by default for production and Docker deployments.
     */
    @Bean
    @Lazy(false)
    public Flyway flyway() {
        return Flyway.configure()
                .dataSource(url, username, password)
                .baselineOnMigrate(true)
                .baselineVersion("99.0.0")
                .baselineDescription("legacy_sqlx_schema")
                .locations("classpath:db/migration")
                .load();
    }

    /**
     * Run Flyway migrations during context initialization.
     * Skipped during test profile where flyway.enabled=false.
     */
    @PostConstruct
    void runMigrations() {
        log.info("Starting Flyway migration...");
        Flyway flyway = Flyway.configure()
                .dataSource(url, username, password)
                .baselineOnMigrate(true)
                .baselineVersion("99.0.0")
                .baselineDescription("legacy_sqlx_schema")
                .locations("classpath:db/migration")
                .load();
        flyway.migrate();
        log.info("Flyway migration completed successfully, {} migrations applied", flyway.info().current().getVersion());
    }
}
