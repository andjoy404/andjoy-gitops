-- H2-compatible schema for test database
-- All tables match the PostgreSQL schema from migrations 0001-0023

CREATE TABLE IF NOT EXISTS app_users (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(2000) NOT NULL,
    display_name    VARCHAR(255) NOT NULL DEFAULT '',
    email           VARCHAR(255) NOT NULL DEFAULT '',
    role            VARCHAR(50) NOT NULL DEFAULT 'editor',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gitlab_environments (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    namespace_id    SMALLINT NOT NULL UNIQUE CHECK (namespace_id BETWEEN 0 AND 127),
    name            VARCHAR(255) NOT NULL,
    base_url        VARCHAR(1000) NOT NULL UNIQUE,
    token_ciphertext BINARY LONG DEFAULT NULL,
    group_ids       TEXT NOT NULL DEFAULT '[]',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    only_top_level  BOOLEAN NOT NULL DEFAULT TRUE,
    include_subgroups BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_tested_at  TIMESTAMP WITH TIME ZONE,
    last_error      VARCHAR(2000),
    is_default      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS app_global_settings (
    singleton       BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    company_name    VARCHAR(255) NOT NULL DEFAULT 'AndJoy GitOps',
    company_logo    VARCHAR(1000) NOT NULL DEFAULT '',
    pipeline_view   VARCHAR(20) NOT NULL DEFAULT 'latest',
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Initial singleton settings
MERGE INTO app_global_settings (singleton) KEY (singleton)
VALUES (TRUE, 'AndJoy GitOps', '', 'latest', CURRENT_TIMESTAMP());

INSERT INTO gitlab_environments (id, namespace_id, name, base_url, token_ciphertext, group_ids, enabled, only_top_level, include_subgroups) VALUES
(1, 1, 'Test Env', 'https://gitlab.example.com/hp123', NULL, '["123"]', true, true, true)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO app_users (id, username, password_hash, display_name, role, enabled, must_change_password)
VALUES (1, 'testuser', '$argon2d$v=19$m=65536,t=3,p=1$5J0/vhr+hfVneWz6IZnNRbu3CM1DzbrgkPCsJ7Dt08A$rXyaC3tzcy89g2VGNMAIBw', 'Test User', 'admin', true, false)
ON DUPLICATE KEY UPDATE id = id;

-- Analytics tables
CREATE TABLE IF NOT EXISTS analytics_sync_state (
    scope TEXT PRIMARY KEY,
    last_started_at TIMESTAMP WITH TIME ZONE,
    last_completed_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_summary_cache (
    cache_key TEXT PRIMARY KEY,
    group_ids TEXT NOT NULL,
    hours INTEGER NOT NULL,
    pipeline_view VARCHAR(20) NOT NULL,
    payload JSON NOT NULL,
    source_completed_epoch BIGINT,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_projects (
    gitlab_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    path VARCHAR(255),
    web_url VARCHAR(1000) NOT NULL,
    default_branch VARCHAR(50),
    namespace_path VARCHAR(255) NOT NULL,
    topics JSON NOT NULL DEFAULT '[]',
    jobs_enabled BOOLEAN NOT NULL,
    namespace_id BIGINT,
    namespace_parent_id BIGINT,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_pipelines (
    gitlab_id BIGINT PRIMARY KEY,
    iid BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    sha VARCHAR(50) NOT NULL,
    branch VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    source VARCHAR(20) NOT NULL,
    coverage DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    web_url VARCHAR(1000) NOT NULL,
    author_id BIGINT,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_runner_state (
    group_id BIGINT PRIMARY KEY,
    payload JSON NOT NULL,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_users (
    gitlab_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    username VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    avatar_url VARCHAR(1000),
    web_url VARCHAR(1000),
    state VARCHAR(50) NOT NULL DEFAULT 'active',
    is_admin BOOLEAN NOT NULL DEFAULT false,
    is_current_member BOOLEAN NOT NULL DEFAULT false,
    last_activity_on DATE,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_user_activity (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    pipeline_count INTEGER NOT NULL DEFAULT 0,
    project_count INTEGER NOT NULL DEFAULT 0,
    last_pipeline_activity TIMESTAMP WITH TIME ZONE,
    job_count INTEGER NOT NULL DEFAULT 0,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    commit_count INTEGER NOT NULL DEFAULT 0,
    issue_count INTEGER NOT NULL DEFAULT 0,
    merge_request_count INTEGER NOT NULL DEFAULT 0,
    push_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_user_events (
    event_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    project_id BIGINT,
    user_id BIGINT NOT NULL,
    action_name VARCHAR(255) NOT NULL,
    target_type VARCHAR(50),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_user_issues (
    issue_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_user_project_relations (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT NOT NULL,
    project_id          BIGINT NOT NULL,
    group_id            BIGINT NOT NULL,
    relation_type       VARCHAR(20) NOT NULL DEFAULT 'membership',
    evidence_type       VARCHAR(20) NOT NULL DEFAULT 'unknown',
    synced_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, project_id, relation_type, evidence_type)
);

CREATE INDEX IF NOT EXISTS analytics_upr_user_id_idx ON analytics_user_project_relations (user_id);
CREATE INDEX IF NOT EXISTS analytics_upr_project_id_idx ON analytics_user_project_relations (project_id);
CREATE INDEX IF NOT EXISTS analytics_upr_group_id_idx ON analytics_user_project_relations (group_id);

CREATE TABLE IF NOT EXISTS analytics_jobs (
    gitlab_id      BIGINT PRIMARY KEY,
    pipeline_id    BIGINT NOT NULL,
    project_id     BIGINT NOT NULL,
    name           VARCHAR(255) NOT NULL,
    stage          VARCHAR(50) NOT NULL,
    branch         VARCHAR(50) NOT NULL,
    status         VARCHAR(20) NOT NULL,
    allow_failure  BOOLEAN NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    web_url        VARCHAR(1000) NOT NULL,
    collected_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS analytics_jobs_pipeline_id_idx ON analytics_jobs (pipeline_id);
CREATE INDEX IF NOT EXISTS analytics_jobs_status_created_idx ON analytics_jobs (status, created_at);
