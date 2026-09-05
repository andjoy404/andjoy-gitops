-- Preserve existing installations while adopting the independent product and
-- neutral theme names. Custom company names remain unchanged.

UPDATE app_global_settings
SET company_name = 'AndJoy GitOps',
    updated_at = NOW()
WHERE company_name IN ('GitLab Ops', 'GitLab CI Dashboard');

UPDATE app_user_preferences
SET theme = 'dark',
    updated_at = NOW()
WHERE theme = 'dracula';
