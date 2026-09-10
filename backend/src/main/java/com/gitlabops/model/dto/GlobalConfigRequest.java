package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class GlobalConfigRequest {

    @JsonProperty("company_name")
    @NotBlank(message = "Company name is required")
    private String companyName;

    @JsonProperty("company_logo")
    private String companyLogo = "";

    @JsonProperty("pipeline_view")
    @Pattern(regexp = "^(all|latest)$", message = "Pipeline view must be 'all' or 'latest'")
    private String pipelineView = "latest";

    @JsonProperty("sso_enabled")
    private Boolean ssoEnabled = false;

    @JsonProperty("local_login_enabled")
    private Boolean localLoginEnabled = true;

    @JsonProperty("oidc_issuer_uri")
    private String oidcIssuerUri;

    @JsonProperty("oidc_client_id")
    private String oidcClientId;

    @JsonProperty("oidc_client_secret")
    private String oidcClientSecret;

    @JsonProperty("oidc_admin_group_claim")
    private String oidcAdminGroupClaim = "groups";

    @JsonProperty("oidc_admin_group_value")
    private String oidcAdminGroupValue = "admin";

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getCompanyLogo() { return companyLogo; }
    public void setCompanyLogo(String companyLogo) { this.companyLogo = companyLogo; }

    public String getPipelineView() { return pipelineView; }
    public void setPipelineView(String pipelineView) { this.pipelineView = pipelineView; }

    public Boolean isSsoEnabled() { return ssoEnabled; }
    public void setSsoEnabled(Boolean ssoEnabled) { this.ssoEnabled = ssoEnabled; }

    public Boolean isLocalLoginEnabled() { return localLoginEnabled; }
    public void setLocalLoginEnabled(Boolean localLoginEnabled) { this.localLoginEnabled = localLoginEnabled; }

    public String getOidcIssuerUri() { return oidcIssuerUri; }
    public void setOidcIssuerUri(String oidcIssuerUri) { this.oidcIssuerUri = oidcIssuerUri; }

    public String getOidcClientId() { return oidcClientId; }
    public void setOidcClientId(String oidcClientId) { this.oidcClientId = oidcClientId; }

    public String getOidcClientSecret() { return oidcClientSecret; }
    public void setOidcClientSecret(String oidcClientSecret) { this.oidcClientSecret = oidcClientSecret; }

    public String getOidcAdminGroupClaim() { return oidcAdminGroupClaim; }
    public void setOidcAdminGroupClaim(String oidcAdminGroupClaim) { this.oidcAdminGroupClaim = oidcAdminGroupClaim; }

    public String getOidcAdminGroupValue() { return oidcAdminGroupValue; }
    public void setOidcAdminGroupValue(String oidcAdminGroupValue) { this.oidcAdminGroupValue = oidcAdminGroupValue; }
}
