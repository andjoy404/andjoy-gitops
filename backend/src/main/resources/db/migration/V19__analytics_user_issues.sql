-- V19__analytics_user_issues.sql
-- Ported from 0019_analytics_user_issues.sql
-- User issue tracking

CREATE TABLE IF NOT EXISTS analytics_user_issues (
    issue_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES analytics_users(gitlab_id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_user_issues_group_time ON analytics_user_issues(group_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_user_issues_user_time ON analytics_user_issues(user_id, occurred_at);
