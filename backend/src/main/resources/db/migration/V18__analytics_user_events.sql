-- V18__analytics_user_events.sql
-- Ported from 0018_analytics_user_events.sql
-- User action event tracking

CREATE TABLE IF NOT EXISTS analytics_user_events (
    event_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    project_id BIGINT,
    user_id BIGINT NOT NULL REFERENCES analytics_users(gitlab_id) ON DELETE CASCADE,
    action_name TEXT NOT NULL,
    target_type TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_user_events_group_time ON analytics_user_events(group_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_user_events_user_time ON analytics_user_events(user_id, occurred_at);
