package com.gitlabops.model.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

public class JobDTO {

    private long id;
    private Instant created_at;
    private boolean allow_failure;
    private String name;
    @JsonProperty("ref")
    private String ref;
    private String stage;
    private String status;
    private String web_url;
    @JsonProperty("pipeline_id")
    private long pipelineId;
    @JsonProperty("project_id")
    private long projectId;
    private Instant finished_at;
    private Double duration;
    private Double queued_duration;
    private Instant started_at;
    @JsonProperty("when")
    private String when;
    private String trigger;
    private Long runner_id;
    private String runner_name;
    private String runner_description;
    private String commit_sha;
    private String commit_short_message;
    private Long parent_job_id;
    private String[] tag_list;
    private String failure_reason;

    public JobDTO() {
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public Instant getCreated_at() {
        return created_at;
    }

    public void setCreated_at(Instant created_at) {
        this.created_at = created_at;
    }

    public boolean isAllow_failure() {
        return allow_failure;
    }

    public void setAllow_failure(boolean allow_failure) {
        this.allow_failure = allow_failure;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getRef() {
        return ref;
    }

    public void setRef(String ref) {
        this.ref = ref;
    }

    public String getStage() {
        return stage;
    }

    public void setStage(String stage) {
        this.stage = stage;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getWeb_url() {
        return web_url;
    }

    public void setWeb_url(String web_url) {
        this.web_url = web_url;
    }

    public long getPipelineId() {
        return pipelineId;
    }

    public void setPipelineId(long pipelineId) {
        this.pipelineId = pipelineId;
    }

    public long getProjectId() {
        return projectId;
    }

    public void setProjectId(long projectId) {
        this.projectId = projectId;
    }

    public Instant getFinished_at() {
        return finished_at;
    }

    public void setFinished_at(Instant finished_at) {
        this.finished_at = finished_at;
    }

    public Double getDuration() {
        return duration;
    }

    public void setDuration(Double duration) {
        this.duration = duration;
    }

    public Double getQueued_duration() {
        return queued_duration;
    }

    public void setQueued_duration(Double queued_duration) {
        this.queued_duration = queued_duration;
    }

    public Instant getStarted_at() {
        return started_at;
    }

    public void setStarted_at(Instant started_at) {
        this.started_at = started_at;
    }

    public String getWhen() {
        return when;
    }

    public void setWhen(String when) {
        this.when = when;
    }

    public String getTrigger() {
        return trigger;
    }

    public void setTrigger(String trigger) {
        this.trigger = trigger;
    }

    public Long getRunner_id() {
        return runner_id;
    }

    public void setRunner_id(Long runner_id) {
        this.runner_id = runner_id;
    }

    public String getRunner_name() {
        return runner_name;
    }

    public void setRunner_name(String runner_name) {
        this.runner_name = runner_name;
    }

    public String getRunner_description() {
        return runner_description;
    }

    public void setRunner_description(String runner_description) {
        this.runner_description = runner_description;
    }

    public String getCommit_sha() {
        return commit_sha;
    }

    public void setCommit_sha(String commit_sha) {
        this.commit_sha = commit_sha;
    }

    public String getCommit_short_message() {
        return commit_short_message;
    }

    public void setCommit_short_message(String commit_short_message) {
        this.commit_short_message = commit_short_message;
    }

    public Long getParent_job_id() {
        return parent_job_id;
    }

    public void setParent_job_id(Long parent_job_id) {
        this.parent_job_id = parent_job_id;
    }

    public String[] getTag_list() {
        return tag_list;
    }

    public void setTag_list(String[] tag_list) {
        this.tag_list = tag_list;
    }

    public String getFailure_reason() {
        return failure_reason;
    }

    public void setFailure_reason(String failure_reason) {
        this.failure_reason = failure_reason;
    }
}
