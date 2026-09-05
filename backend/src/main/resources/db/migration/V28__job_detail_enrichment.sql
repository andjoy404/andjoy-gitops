-- V28__job_detail_enrichment.sql
-- Enrich analytics_jobs with GitLab API detail fields for the job detail modal

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'finished_at'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN finished_at TIMESTAMPTZ;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'duration'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN duration DOUBLE PRECISION;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'queued_duration'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN queued_duration DOUBLE PRECISION;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'started_at'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN started_at TIMESTAMPTZ;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'when'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN when_keyword TEXT NOT NULL DEFAULT 'on_success';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'trigger'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN trigger_keyword TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'runner_id'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN runner_id BIGINT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'runner_name'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN runner_name TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'runner_description'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN runner_description TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'commit_sha'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN commit_sha TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'job_tags'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN job_tags JSONB NOT NULL DEFAULT '[]';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'analytics_jobs' AND column_name = 'failure_reason'
    ) THEN
        ALTER TABLE analytics_jobs ADD COLUMN failure_reason TEXT;
    END IF;
END $$;
