DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'pipeline_user_username'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN pipeline_user_username TEXT;
    END IF;
END $$;
