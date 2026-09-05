-- V10__environment_default.sql
-- Ported from 0010_environment_default.sql
-- Track default GitLab environment

ALTER TABLE gitlab_environments ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_environments_default_one ON gitlab_environments(is_default) WHERE is_default = TRUE;
