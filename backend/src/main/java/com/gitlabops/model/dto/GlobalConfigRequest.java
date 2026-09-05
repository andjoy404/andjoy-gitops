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

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getCompanyLogo() { return companyLogo; }
    public void setCompanyLogo(String companyLogo) { this.companyLogo = companyLogo; }

    public String getPipelineView() { return pipelineView; }
    public void setPipelineView(String pipelineView) { this.pipelineView = pipelineView; }
}
