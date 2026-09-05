-- V6__app_user_preferences.sql
-- Ported from 0006_user_preferences.sql
-- Per-user preferences (theme, favorites)

CREATE TABLE IF NOT EXISTS app_user_preferences (
    user_id BIGINT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    favorite_projects JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
