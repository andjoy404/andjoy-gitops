-- V13__user_contribution_metrics.sql
-- Ported from 0013_user_contribution_metrics.sql
-- Per-user contribution metrics

ALTER TABLE analytics_user_activity
    ADD COLUMN IF NOT EXISTS commit_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS issue_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS merge_request_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS push_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;

UPDATE analytics_user_activity ua
SET
    commit_count = metrics.commit_count,
    merge_request_count = metrics.merge_request_count
FROM (
    SELECT
        au.gitlab_id AS user_id,
        au.group_id,
        COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.source = 'push') AS commit_count,
        COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.source = 'merge_request_event') AS merge_request_count
    FROM analytics_users au
    JOIN analytics_projects proj ON proj.group_id = au.group_id
    JOIN analytics_pipelines p ON p.project_id = proj.gitlab_id AND p.author_id = au.gitlab_id
    GROUP BY au.gitlab_id, au.group_id
) metrics
WHERE ua.user_id = metrics.user_id AND ua.group_id = metrics.group_id;
