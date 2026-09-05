package com.gitlabops.model.dto;

/**
 * Represents a GitLab runner from the GitLab API response.
 */
public record GitlabRunner(
    long id,
    String description,
    boolean is_shared,
    String runner_type,
    String status,
    boolean online,
    String job_execution_status,
    boolean paused,
    boolean is_locked,
    String tag_list,
    String ip_address,
    String username,
    Integer last_job_finished_at,
    String contacted_at,
    String reached_at,
    long[] projects_ids,
    long[] runners_groups_ids
) {
    public GitlabRunner(long id, String description, boolean is_shared, String runner_type,
                        String status, boolean online, String job_execution_status, boolean paused,
                        boolean is_locked, String tag_list, String ip_address, String username,
                        Integer last_job_finished_at, String contacted_at, String reached_at,
                        long[] projects_ids, long[] runners_groups_ids) {
        this.id = id;
        this.description = description;
        this.is_shared = is_shared;
        this.runner_type = runner_type;
        this.status = status;
        this.online = online;
        this.job_execution_status = job_execution_status;
        this.paused = paused;
        this.is_locked = is_locked;
        this.tag_list = tag_list;
        this.ip_address = ip_address;
        this.username = username;
        this.last_job_finished_at = last_job_finished_at;
        this.contacted_at = contacted_at;
        this.reached_at = reached_at;
        this.projects_ids = projects_ids;
        this.runners_groups_ids = runners_groups_ids;
    }
}
