-- V9__app_users_force_password_change.sql
-- Ported from 0009_app_users_force_password_change.sql
-- Require users to change password on first login

ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
