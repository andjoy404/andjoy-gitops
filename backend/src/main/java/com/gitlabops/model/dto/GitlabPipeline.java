package com.gitlabops.model.dto;

import java.util.List;
import java.util.Map;

/**
 * Represents a GitLab pipeline from the GitLab API response.
 */
public record GitlabPipeline(
    long id,
    long iid,
    long projectId,
    String ref,
    String sha,
    String status,
    String source,
    String created_at,
    String updated_at,
    String web_url,
    double coverage,
    Long authorId,
    Map<String, Object> details,
    String started_at
) {
    public GitlabPipeline(long id, long iid, long projectId, String ref, String sha, String status,
                          String source, String created_at, String updated_at, String web_url,
                          double coverage, Long authorId, Map<String, Object> details, String started_at) {
        this.id = id;
        this.iid = iid;
        this.projectId = projectId;
        this.ref = ref;
        this.sha = sha;
        this.status = status;
        this.source = source;
        this.created_at = created_at;
        this.updated_at = updated_at;
        this.web_url = web_url;
        this.coverage = coverage;
        this.authorId = authorId;
        this.details = details;
        this.started_at = started_at;
    }
    
    public boolean hasAuthor() {
        return authorId != null && authorId > 0;
    }
}
