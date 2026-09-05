-- V11__analytics_users.sql
-- Ported from 0011_analytics_users.sql
-- GitLab user profiles and per-user activity tracking

CREATE TABLE IF NOT EXISTS analytics_users (
    gitlab_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    username TEXT NOT NULL,
    name TEXT,
    email TEXT,
    avatar_url TEXT,
    web_url TEXT,
    state TEXT NOT NULL DEFAULT 'active',
    is_admin BOOLEAN NOT NULL DEFAULT false,
    last_activity_on TEXT,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_users_group ON analytics_users(group_id);
CREATE INDEX IF NOT EXISTS idx_analytics_users_state ON analytics_users(state);

CREATE TABLE IF NOT EXISTS analytics_user_activity (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES analytics_users(gitlab_id) ON DELETE CASCADE,
    group_id BIGINT NOT NULL,
    pipeline_count INTEGER NOT NULL DEFAULT 0,
    project_count INTEGER NOT NULL DEFAULT 0,
    last_pipeline_activity TIMESTAMPTZ,
    job_count INTEGER NOT NULL DEFAULT 0,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_user_activity_user ON analytics_user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_activity_group ON analytics_user_activity(group_id);
