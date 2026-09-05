package com.gitlabops.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class StartupValidator {

    private static final Logger log = LoggerFactory.getLogger(StartupValidator.class);

    @Autowired
    private SecurityProperties securityProperties;

    @Autowired
    private Environment environment;

    @PostConstruct
    void validate() {
        validateEncryptionKey();
        validateDatabaseUrl();
    }

    private void validateEncryptionKey() {
        String key = securityProperties.getEncryptionKey();
        if (key == null || key.isEmpty()) {
            log.error("");
            log.error("VALIDATION FAILED: ENVIRONMENT_TOKEN_ENCRYPTION_KEY is not set.");
            log.error("Generate a 64-hex-character key (32 bytes):");
            log.error("  openssl rand -hex 32");
            log.error("Set it via environment variable or application configuration.");
            log.error("");
            throw new IllegalStateException(
                "security.encryption-key must be a 64-hex-character string (32 bytes). " +
                "Generate one with: openssl rand -hex 32");
        }

        if (key.length() != 64) {
            log.error("");
            log.error("VALIDATION FAILED: security.encryption-key must be exactly 64 hex characters.");
            log.error("  Got {} characters.", key.length());
            log.error("");
            throw new IllegalStateException(
                "security.encryption-key must be a 64-hex-character string (32 bytes). " +
                "Got " + key.length() + " characters.");
        }

        if (!key.matches("[0-9a-fA-F]+")) {
            log.error("");
            log.error("VALIDATION FAILED: security.encryption-key must contain only hex characters (0-9, a-f, A-F).");
            log.error("");
            throw new IllegalStateException(
                "security.encryption-key must be a valid 64-hex-character string. " +
                "Only hexadecimal characters (0-9, a-f, A-F) are allowed.");
        }
    }

    private void validateDatabaseUrl() {
        String url = environment.getProperty("spring.datasource.url");
        if (url == null || url.isEmpty()) {
            log.error("");
            log.error("VALIDATION FAILED: spring.datasource.url is not set.");
            log.error("Provide database connection via:");
            log.error("  SPRING_DATASOURCE_URL=jdbc:postgresql://host:port/dbname");
            log.error("");
            throw new IllegalStateException(
                "spring.datasource.url is required. Set DATABASE_URL or SPRING_DATASOURCE_URL environment variable.");
        }
    }
}
