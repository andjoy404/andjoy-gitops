-- V12__pipeline_author_tracking.sql
-- Ported from 0012_pipeline_author_tracking.sql
-- Track pipeline authors for user activity attribution

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'analytics_user_activity_user_group_key'
    ) THEN
        ALTER TABLE analytics_user_activity
            ADD CONSTRAINT analytics_user_activity_user_group_key
            UNIQUE (user_id, group_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_pipelines' AND column_name = 'author_id'
    ) THEN
        ALTER TABLE analytics_pipelines ADD COLUMN IF NOT EXISTS author_id BIGINT;
    END IF;
END $$;

INSERT INTO analytics_user_activity (user_id, group_id, pipeline_count, project_count, job_count, last_pipeline_activity)
SELECT au.gitlab_id, au.group_id,
       COUNT(DISTINCT p.gitlab_id) AS pipeline_count,
       COUNT(DISTINCT p.project_id) AS project_count,
       COUNT(DISTINCT j.gitlab_id) AS job_count,
       MAX(p.updated_at) AS last_pipeline_activity
FROM analytics_users au
JOIN analytics_projects proj ON proj.group_id = au.group_id
JOIN analytics_pipelines p ON p.project_id = proj.gitlab_id AND p.author_id = au.gitlab_id
LEFT JOIN analytics_jobs j ON j.pipeline_id = p.gitlab_id
GROUP BY au.gitlab_id, au.group_id
ON CONFLICT (user_id, group_id) DO UPDATE SET
    pipeline_count = EXCLUDED.pipeline_count,
    project_count = EXCLUDED.project_count,
    job_count = EXCLUDED.job_count,
    last_pipeline_activity = EXCLUDED.last_pipeline_activity
WHERE EXCLUDED.pipeline_count > 0 OR EXCLUDED.job_count > 0;
