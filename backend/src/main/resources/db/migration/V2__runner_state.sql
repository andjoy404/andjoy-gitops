-- V2__runner_state.sql
-- Ported from 0002_runner_state.sql
-- Current state tracking for GitLab runners

CREATE TABLE IF NOT EXISTS analytics_runner_state (
    group_id BIGINT PRIMARY KEY,
    payload JSONB NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
