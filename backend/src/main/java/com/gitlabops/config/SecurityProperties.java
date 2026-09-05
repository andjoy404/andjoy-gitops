package com.gitlabops.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component("securityProperties")
@ConfigurationProperties(prefix = "security")
public class SecurityProperties {

    private String encryptionKey;

    @Autowired
    private Environment environment;

    @Value("${security.encryption-key:}")
    private String configuredEncryptionKey;

    public String getEncryptionKey() {
        if (encryptionKey != null && !encryptionKey.isEmpty()) {
            return encryptionKey;
        }
        return configuredEncryptionKey;
    }

    public void setEncryptionKey(String encryptionKey) {
        this.encryptionKey = encryptionKey;
    }

    @PostConstruct
    void init() {
        // Accept environment-token encryption key as env var fallback
        if ((encryptionKey == null || encryptionKey.isEmpty()) && configuredEncryptionKey == null) {
            String envKey = System.getenv("ENVIRONMENT_TOKEN_ENCRYPTION_KEY");
            if (envKey != null && !envKey.isEmpty()) {
                this.encryptionKey = envKey;
            }
        }
    }
}
