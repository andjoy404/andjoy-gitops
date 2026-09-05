-- V16__backfill_user_activity_rows.sql
-- Ported from 0016_backfill_user_activity_rows.sql
-- Backfill user activity rows for new users

INSERT INTO analytics_user_activity (user_id, group_id)
SELECT au.gitlab_id, au.group_id
FROM analytics_users au
ON CONFLICT (user_id, group_id) DO NOTHING;
