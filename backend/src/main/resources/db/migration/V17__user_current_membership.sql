-- V17__user_current_membership.sql
-- Ported from 0017_user_current_membership.sql
-- Track active GitLab membership status

ALTER TABLE analytics_users
    ADD COLUMN IF NOT EXISTS is_current_member BOOLEAN NOT NULL DEFAULT false;
