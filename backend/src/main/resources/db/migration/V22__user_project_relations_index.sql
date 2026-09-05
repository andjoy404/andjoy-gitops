-- V22__user_project_relations_index.sql
-- Ported from 0022_user_project_relations_index.sql
-- No-op migration for version tracking (index already created in V21)

DO $$ BEGIN
    RAISE NOTICE 'V22: Version tracking migration - no schema changes required';
END $$;
