-- V30__job_commit_message.sql
-- Add commit short message for job detail modal

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'commit_short_message'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN commit_short_message TEXT;
    END IF;
END $$;
