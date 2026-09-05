-- V14__user_activity_push_backfill.sql
-- Ported from 0014_user_activity_push_backfill.sql
-- Backfill push counts from pipeline data

UPDATE analytics_user_activity ua
SET push_count = metrics.push_count
FROM (
    SELECT
        au.gitlab_id AS user_id,
        au.group_id,
        COUNT(DISTINCT p.gitlab_id) FILTER (WHERE p.source = 'push') AS push_count
    FROM analytics_users au
    JOIN analytics_projects proj ON proj.group_id = au.group_id
    JOIN analytics_pipelines p ON p.project_id = proj.gitlab_id AND p.author_id = au.gitlab_id
    GROUP BY au.gitlab_id, au.group_id
) metrics
WHERE ua.user_id = metrics.user_id AND ua.group_id = metrics.group_id;
