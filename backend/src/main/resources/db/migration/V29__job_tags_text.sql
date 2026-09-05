-- V29__job_tags_text.sql
-- job_tags stored as JSON string, never queried with JSON operators;
-- jdbc binds as varchar so Cast(? AS jsonb) fails on prepared statements.
-- Change to text so plain binding works.

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_jobs' AND column_name = 'job_tags' AND data_type = 'jsonb') THEN
        ALTER TABLE analytics_jobs ALTER COLUMN job_tags TYPE text USING job_tags::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_jobs' AND column_name = 'job_tags') THEN
        ALTER TABLE analytics_jobs ADD COLUMN job_tags text NOT NULL DEFAULT '[]'::text;
    END IF;
END $$;
