package com.gitlabops.model.dto;

import java.util.Map;

/**
 * Represents a GitLab job from the GitLab API response.
 */
public record GitlabJob(
    long id,
    long projectId,
    String name,
    String stage,
    String status,
    long pipelineId,
    String ref,
    String sha,
    String createdAt,
    String updatedAt,
    String startedAt,
    String finishedAt,
    double duration,
    boolean allowFailure,
    boolean running,
    Integer runnerId,
    String webUrl,
    String tagList,
    Map<String, Object> details
) {
}
