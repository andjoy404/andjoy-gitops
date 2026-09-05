package com.gitlabops.service;

import com.gitlabops.model.dto.JobDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.time.Instant;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class JobService {

    private static final Logger log = LoggerFactory.getLogger(JobService.class);
    private static final Duration EMPTY_BACKFILL_COOLDOWN = Duration.ofMinutes(5);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final GitLabApiClient gitLabApiClient;
    private final AnalyticsSyncStorage syncStorage;
    private final Map<Long, Instant> backfillAttempts = new ConcurrentHashMap<>();

    public JobService(DataSource dataSource,
                      GitLabApiClient gitLabApiClient,
                      AnalyticsSyncStorage syncStorage) {
        this.jdbcTemplate = new JdbcTemplate(dataSource);
        this.objectMapper = new ObjectMapper();
        this.gitLabApiClient = gitLabApiClient;
        this.syncStorage = syncStorage;
    }

    public List<JobDTO> getJobs(long projectId, long pipelineId, String[] statuses) {
        StringBuilder sql = new StringBuilder(
            "SELECT gitlab_id AS id, created_at, allow_failure, name, "
            + "branch, stage, status, web_url, pipeline_id, project_id, "
            + "finished_at, duration, queued_duration, started_at, when_keyword, "
            + "trigger_keyword, runner_id, runner_name, runner_description, "
            + "commit_sha, commit_short_message, job_tags, failure_reason, "
            + "parent_job_id "
            + "FROM analytics_jobs "
            + "WHERE project_id = ? AND pipeline_id = ?"
        );
        List<Object> params = new ArrayList<>();
        params.add(projectId);
        params.add(pipelineId);

        if (statuses != null && statuses.length > 0) {
            sql.append(" AND status IN (");
            for (int i = 0; i < statuses.length; i++) {
                if (i > 0) sql.append(",");
                sql.append("?");
                params.add(statuses[i]);
            }
            sql.append(")");
        }

        sql.append(" ORDER BY created_at ASC");

        List<JobDTO> result = new ArrayList<>();
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), params.toArray());
            for (Map<String, Object> row : rows) {
                JobDTO job = new JobDTO();
                job.setId(asLong(row.get("id")));
                job.setCreated_at(asInstant(row.get("created_at")));
                job.setAllow_failure(asBoolean(row.get("allow_failure")));
                job.setName((String) row.get("name"));
                job.setRef((String) row.get("branch"));
                job.setStage((String) row.get("stage"));
                job.setStatus((String) row.get("status"));
                job.setWeb_url((String) row.get("web_url"));
                job.setPipelineId(asLong(row.get("pipeline_id")));
                job.setProjectId(asLong(row.get("project_id")));
                job.setFinished_at(asInstant(row.get("finished_at")));
                job.setDuration(asDouble(row.get("duration")));
                job.setQueued_duration(asDouble(row.get("queued_duration")));
                job.setStarted_at(asInstant(row.get("started_at")));
                job.setWhen((String) row.get("when_keyword"));
                job.setTrigger((String) row.get("trigger_keyword"));
                job.setRunner_id(asLongNullable(row.get("runner_id")));
                job.setRunner_name((String) row.get("runner_name"));
                job.setRunner_description((String) row.get("runner_description"));
                job.setCommit_sha((String) row.get("commit_sha"));
                job.setCommit_short_message((String) row.get("commit_short_message"));
                Object tags = row.get("job_tags");
                if (tags != null) {
                    try {
                        job.setTag_list(objectMapper.readValue(
                            tags.toString(), String[].class));
                    } catch (Exception ignored) {
                        job.setTag_list(new String[0]);
                    }
                }
                job.setFailure_reason((String) row.get("failure_reason"));
                job.setParent_job_id(asLongNullable(row.get("parent_job_id")));
                result.add(job);
            }
        } catch (Exception e) {
            log.warn("Error fetching jobs: {}", e.getMessage());
        }

        return result;
    }

    public List<JobDTO> getBatchJobs(List<Long> pipelineIds, List<Long> projectIds) {
        List<JobDTO> result = queryBatchJobs(pipelineIds, projectIds);
        if (pipelineIds == null || pipelineIds.isEmpty()) return result;

        Set<Long> populatedPipelineIds = new HashSet<>();
        for (JobDTO job : result) populatedPipelineIds.add(job.getPipelineId());

        List<Long> missingPipelineIds = pipelineIds.stream()
            .filter(id -> !populatedPipelineIds.contains(id))
            .distinct()
            .toList();
        if (missingPipelineIds.isEmpty()) return result;

        boolean persisted = backfillSuccessfulPipelines(missingPipelineIds);
        return persisted ? queryBatchJobs(pipelineIds, projectIds) : result;
    }

    private List<JobDTO> queryBatchJobs(List<Long> pipelineIds, List<Long> projectIds) {
        StringBuilder sql = new StringBuilder(
            "SELECT gitlab_id AS id, created_at, allow_failure, name, "
            + "branch, stage, status, web_url, pipeline_id, project_id, "
            + "finished_at, duration, queued_duration, started_at, when_keyword, "
            + "trigger_keyword, runner_id, runner_name, runner_description, "
            + "commit_sha, commit_short_message, job_tags, failure_reason, "
            + "parent_job_id "
            + "FROM analytics_jobs "
            + "WHERE 1=1"
        );
        List<Object> params = new ArrayList<>();

        if (pipelineIds != null && !pipelineIds.isEmpty()) {
            sql.append(" AND pipeline_id IN (");
            for (int i = 0; i < pipelineIds.size(); i++) {
                if (i > 0) sql.append(",");
                sql.append("?");
                params.add(pipelineIds.get(i));
            }
            sql.append(")");
        }

        if (projectIds != null && !projectIds.isEmpty()) {
            sql.append(" AND project_id IN (");
            for (int i = 0; i < projectIds.size(); i++) {
                if (i > 0) sql.append(",");
                sql.append("?");
                params.add(projectIds.get(i));
            }
            sql.append(")");
        }

        sql.append(" ORDER BY pipeline_id, created_at ASC");

        List<JobDTO> result = new ArrayList<>();
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql.toString(), params.toArray());
            for (Map<String, Object> row : rows) {
                JobDTO job = new JobDTO();
                job.setId(asLong(row.get("id")));
                job.setCreated_at(asInstant(row.get("created_at")));
                job.setAllow_failure(asBoolean(row.get("allow_failure")));
                job.setName((String) row.get("name"));
                job.setRef((String) row.get("branch"));
                job.setStage((String) row.get("stage"));
                job.setStatus((String) row.get("status"));
                job.setWeb_url((String) row.get("web_url"));
                job.setPipelineId(asLong(row.get("pipeline_id")));
                job.setProjectId(asLong(row.get("project_id")));
                job.setFinished_at(asInstant(row.get("finished_at")));
                job.setDuration(asDouble(row.get("duration")));
                job.setQueued_duration(asDouble(row.get("queued_duration")));
                job.setStarted_at(asInstant(row.get("started_at")));
                job.setWhen((String) row.get("when_keyword"));
                job.setTrigger((String) row.get("trigger_keyword"));
                job.setRunner_id(asLongNullable(row.get("runner_id")));
                job.setRunner_name((String) row.get("runner_name"));
                job.setRunner_description((String) row.get("runner_description"));
                job.setCommit_sha((String) row.get("commit_sha"));
                job.setCommit_short_message((String) row.get("commit_short_message"));
                Object tags = row.get("job_tags");
                if (tags != null) {
                    try {
                        job.setTag_list(objectMapper.readValue(
                            tags.toString(), String[].class));
                    } catch (Exception ignored) {
                        job.setTag_list(new String[0]);
                    }
                }
                job.setFailure_reason((String) row.get("failure_reason"));
                job.setParent_job_id(asLongNullable(row.get("parent_job_id")));
                result.add(job);
            }
        } catch (Exception e) {
            log.warn("Error fetching batch jobs: {}", e.getMessage());
        }

        return result;
    }

    private boolean backfillSuccessfulPipelines(List<Long> pipelineIds) {
        String placeholders = String.join(",", java.util.Collections.nCopies(pipelineIds.size(), "?"));
        String sql = "SELECT p.gitlab_id, p.project_id, COALESCE(p.author_id, 0) AS author_id, "
            + "ap.namespace_id "
            + "FROM analytics_pipelines p "
            + "LEFT JOIN analytics_projects ap ON ap.gitlab_id = p.project_id "
            + "WHERE LOWER(p.status) = 'success' "
            + "AND p.gitlab_id IN (" + placeholders + ")";
        boolean persisted = false;
        Instant now = Instant.now();

        try {
            for (Map<String, Object> pipeline : jdbcTemplate.queryForList(sql, pipelineIds.toArray())) {
                long pipelineId = asLong(pipeline.get("gitlab_id"));
                Instant lastAttempt = backfillAttempts.get(pipelineId);
                if (lastAttempt != null && lastAttempt.plus(EMPTY_BACKFILL_COOLDOWN).isAfter(now)) continue;
                backfillAttempts.put(pipelineId, now);

                long projectId = asLong(pipeline.get("project_id"));
                long authorId = asLong(pipeline.get("author_id"));
                Object ns = pipeline.get("namespace_id");
                long namespaceId = ns instanceof Number n ? n.longValue() : 0L;
                List<Map<String, Object>> jobs =
                    gitLabApiClient.getJobsForPipeline(projectId, pipelineId, namespaceId);
                if (!jobs.isEmpty()) {
                    syncStorage.upsertJobs(jobs, pipelineId, projectId, authorId);
                    persisted = true;
                    backfillAttempts.remove(pipelineId);
                }
            }
        } catch (Exception e) {
            log.warn("Error backfilling successful pipeline jobs: {}", e.getMessage());
        }
        return persisted;
    }

    private Long asLong(Object obj) {
        if (obj == null) return 0L;
        return ((Number) obj).longValue();
    }

    private Instant asInstant(Object obj) {
        if (obj == null) return null;
        if (obj instanceof java.sql.Timestamp ts) return ts.toInstant();
        if (obj instanceof java.time.Instant i) return i;
        return null;
    }

    private Boolean asBoolean(Object obj) {
        if (obj == null) return false;
        if (obj instanceof Boolean b) return b;
        if (obj instanceof Number n) return n.intValue() != 0;
        return Boolean.valueOf(obj.toString());
    }

    private Long asLongNullable(Object obj) {
        if (obj == null) return null;
        return ((Number) obj).longValue();
    }

    private Double asDouble(Object obj) {
        if (obj == null) return null;
        return ((Number) obj).doubleValue();
    }
}
