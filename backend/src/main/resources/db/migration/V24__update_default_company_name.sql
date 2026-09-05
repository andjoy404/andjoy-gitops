-- V24__update_default_company_name.sql
-- Change the default company_name from legacy 'GitLab CI Dashboard' to 'GitLab Ops'.
-- Only affects rows that still hold the old default; custom values are preserved.

UPDATE app_global_settings
SET company_name = 'GitLab Ops',
    updated_at = NOW()
WHERE company_name = 'GitLab CI Dashboard';
