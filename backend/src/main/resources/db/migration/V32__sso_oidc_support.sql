-- V32__sso_oidc_support.sql
-- Add SSO/OIDC support for user accounts and global configuration

-- User SSO: track auth provider and external identity
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_users' AND column_name = 'auth_provider') THEN
        ALTER TABLE app_users
            ADD COLUMN auth_provider VARCHAR NOT NULL DEFAULT 'local';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_users' AND column_name = 'provider_user_id') THEN
        ALTER TABLE app_users
            ADD COLUMN provider_user_id VARCHAR;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'app_users_provider_user_id_key'
    ) THEN
        ALTER TABLE app_users
            ADD CONSTRAINT app_users_provider_user_id_key UNIQUE (provider_user_id);
    END IF;
END $$;

-- Global settings: SSO/OIDC configuration columns
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_global_settings' AND column_name = 'sso_enabled') THEN
        ALTER TABLE app_global_settings
            ADD COLUMN sso_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_global_settings' AND column_name = 'local_login_enabled') THEN
        ALTER TABLE app_global_settings
            ADD COLUMN local_login_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_global_settings' AND column_name = 'oidc_issuer_uri') THEN
        ALTER TABLE app_global_settings
            ADD COLUMN oidc_issuer_uri VARCHAR;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_global_settings' AND column_name = 'oidc_client_id') THEN
        ALTER TABLE app_global_settings
            ADD COLUMN oidc_client_id VARCHAR;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_global_settings' AND column_name = 'oidc_client_secret') THEN
        ALTER TABLE app_global_settings
            ADD COLUMN oidc_client_secret VARCHAR;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_global_settings' AND column_name = 'oidc_admin_group_claim') THEN
        ALTER TABLE app_global_settings
            ADD COLUMN oidc_admin_group_claim VARCHAR NOT NULL DEFAULT 'groups';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'app_global_settings' AND column_name = 'oidc_admin_group_value') THEN
        ALTER TABLE app_global_settings
            ADD COLUMN oidc_admin_group_value VARCHAR NOT NULL DEFAULT 'admin';
    END IF;
END $$;
