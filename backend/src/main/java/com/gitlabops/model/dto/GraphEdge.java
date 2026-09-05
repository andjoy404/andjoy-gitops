package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class GraphEdge {

    @JsonProperty("id")
    private String id;
    @JsonProperty("source")
    private String source;
    @JsonProperty("target")
    private String target;
    @JsonProperty("type")
    private String type;
    @JsonProperty("evidence_type")
    private String evidenceType;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getTarget() { return target; }
    public void setTarget(String target) { this.target = target; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getEvidenceType() { return evidenceType; }
    public void setEvidenceType(String evidenceType) { this.evidenceType = evidenceType; }
}
