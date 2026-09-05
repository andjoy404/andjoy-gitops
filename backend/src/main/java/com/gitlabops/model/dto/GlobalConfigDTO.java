package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class GlobalConfigDTO {

    @JsonProperty("company_name")
    private String companyName;

    @JsonProperty("company_logo")
    private String companyLogo;

    @JsonProperty("pipeline_view")
    private String pipelineView;

    public GlobalConfigDTO() {
    }

    public GlobalConfigDTO(String companyName, String companyLogo, String pipelineView) {
        this.companyName = companyName;
        this.companyLogo = companyLogo;
        this.pipelineView = pipelineView;
    }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getCompanyLogo() { return companyLogo; }
    public void setCompanyLogo(String companyLogo) { this.companyLogo = companyLogo; }

    public String getPipelineView() { return pipelineView; }
    public void setPipelineView(String pipelineView) { this.pipelineView = pipelineView; }
}
