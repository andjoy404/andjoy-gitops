ALTER TABLE analytics_jobs ADD COLUMN parent_job_id BIGINT;
CREATE INDEX IF NOT EXISTS analytics_jobs_parent_job_id_idx ON analytics_jobs (parent_job_id);
