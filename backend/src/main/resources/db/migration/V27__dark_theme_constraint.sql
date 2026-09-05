-- Migrate the user-preferences theme constraint from the legacy
-- 'dracula' value to the neutral 'dark' value. V26 already converted any
-- stored dracula rows; this finishes the transition by replacing the
-- check constraint that still only accepts light/dracula.
ALTER TABLE app_user_preferences
    DROP CONSTRAINT IF EXISTS app_user_preferences_theme_check;

ALTER TABLE app_user_preferences
    ADD CONSTRAINT app_user_preferences_theme_check
    CHECK (theme IN ('light', 'dark'));
