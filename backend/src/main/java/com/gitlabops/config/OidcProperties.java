package com.gitlabops.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component("oidcProperties")
@ConfigurationProperties(prefix = "oidc")
public class OidcProperties {

    private String issuerUri = "";
    private String clientId = "";
    private String clientSecret = "";
    private String adminGroupClaim = "groups";
    private String adminGroupValue = "admin";

    public String getIssuerUri() { return issuerUri; }
    public void setIssuerUri(String issuerUri) { this.issuerUri = issuerUri; }

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }

    public String getClientSecret() { return clientSecret; }
    public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }

    public String getAdminGroupClaim() { return adminGroupClaim; }
    public void setAdminGroupClaim(String adminGroupClaim) { this.adminGroupClaim = adminGroupClaim; }

    public String getAdminGroupValue() { return adminGroupValue; }
    public void setAdminGroupValue(String adminGroupValue) { this.adminGroupValue = adminGroupValue; }

    public boolean isEnabled() {
        return (issuerUri != null && !issuerUri.isBlank())
            || (clientId != null && !clientId.isBlank() && clientId.startsWith("oidc_client"));
    }
}
