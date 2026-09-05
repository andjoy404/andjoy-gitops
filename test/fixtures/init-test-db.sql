-- =====================================================
-- AndJoy GitOps — Test Database Schema Initialization
-- =====================================================
-- This file initializes the test database with only the
-- tables required for Phase 2.1 runtime validation.
-- It is TEST-ONLY and must NEVER be run against the
-- shared application database.
-- =====================================================

-- Migration 0005: application_users table (auth)
CREATE TABLE IF NOT EXISTS app_users (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL DEFAULT '',
    email           TEXT NOT NULL DEFAULT '',
    role            VARCHAR(50) NOT NULL DEFAULT 'editor',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration 0003: gitlab_environments table (config)
CREATE TABLE IF NOT EXISTS gitlab_environments (
    id              BIGSERIAL PRIMARY KEY,
    namespace_id    SMALLINT NOT NULL UNIQUE CHECK (namespace_id BETWEEN 0 AND 127),
    name            TEXT NOT NULL,
    base_url        TEXT NOT NULL UNIQUE,
    token_ciphertext BYTEA DEFAULT NULL,
    group_ids       BIGINT[] NOT NULL DEFAULT '{}',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    only_top_level  BOOLEAN NOT NULL DEFAULT TRUE,
    include_subgroups BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_tested_at  TIMESTAMPTZ,
    last_error      TEXT,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE
);

-- Migration 0004: app_global_settings table (global config)
CREATE TABLE IF NOT EXISTS app_global_settings (
    singleton       BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    company_name    TEXT NOT NULL DEFAULT 'AndJoy GitOps',
    company_logo    TEXT NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_global_settings (singleton) VALUES (TRUE)
    ON CONFLICT (singleton) DO NOTHING;

-- Migration 0007: add pipeline_view column
ALTER TABLE app_global_settings
    ADD COLUMN IF NOT EXISTS pipeline_view TEXT NOT NULL DEFAULT 'latest';

-- Migration 0010: is_default column (already in 0003 DDL for environments)

-- Test environment (required for hasActivePool() to return true)
INSERT INTO gitlab_environments (id, namespace_id, name, base_url, token_ciphertext, group_ids, enabled, only_top_level, include_subgroups) VALUES
(1, 1, 'Test Env', 'https://gitlab.example.com', NULL, ARRAY[123], true, true, true)
ON CONFLICT (id) DO NOTHING;

-- Explicit fixture IDs do not advance a SERIAL sequence automatically.
SELECT setval(
    pg_get_serial_sequence('gitlab_environments', 'id'),
    (SELECT MAX(id) FROM gitlab_environments)
);

-- =====================================================
-- Test User Fixture (Phase 2.1 auth)
-- =====================================================
-- Password: 'testPassword123'
INSERT INTO app_users (id, username, password_hash, display_name, role, enabled, must_change_password)
VALUES (1, 'testuser', '$argon2d$v=19$m=65536,t=3,p=1$5J0/vhr+hfVneWz6IZnNRbu3CM1DzbrgkPCsJ7Dt08A$rXyaC3tzcy89g2VGNMAIBw', 'Test User', 'admin', true, false)
ON CONFLICT (id) DO NOTHING;

-- Migration 0007: add pipeline_view column
ALTER TABLE app_global_settings
    ADD COLUMN IF NOT EXISTS pipeline_view TEXT NOT NULL DEFAULT 'latest';

-- Analytics tables for Dashboard phase testing

-- 0001: analytics sync state
CREATE TABLE IF NOT EXISTS analytics_sync_state (
    scope TEXT PRIMARY KEY,
    last_started_at TIMESTAMPTZ,
    last_completed_at TIMESTAMPTZ,
    last_error TEXT,
    updated_at TIMESTAMPTZ
);

-- 0008: analytics summary cache
CREATE TABLE IF NOT EXISTS analytics_summary_cache (
    cache_key TEXT PRIMARY KEY,
    group_ids BIGINT[] NOT NULL,
    hours INTEGER NOT NULL,
    pipeline_view TEXT NOT NULL,
    payload JSONB NOT NULL,
    source_completed_epoch BIGINT,
    computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0001: analytics projects
CREATE TABLE IF NOT EXISTS analytics_projects (
    gitlab_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    path TEXT,
    web_url TEXT NOT NULL,
    default_branch TEXT,
    namespace_path TEXT NOT NULL,
    topics JSONB NOT NULL DEFAULT '[]',
    jobs_enabled BOOLEAN NOT NULL,
    namespace_id BIGINT,
    namespace_parent_id BIGINT,
    last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0001: analytics pipelines
CREATE TABLE IF NOT EXISTS analytics_pipelines (
    gitlab_id BIGINT PRIMARY KEY,
    iid BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    sha TEXT NOT NULL,
    branch TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    coverage DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    web_url TEXT NOT NULL,
    author_id BIGINT,
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0002: analytics runner state
CREATE TABLE IF NOT EXISTS analytics_runner_state (
    group_id BIGINT PRIMARY KEY,
    payload JSONB NOT NULL,
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0011, 0017: analytics users
CREATE TABLE IF NOT EXISTS analytics_users (
    gitlab_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    username TEXT NOT NULL,
    name TEXT,
    email TEXT,
    avatar_url TEXT,
    web_url TEXT,
    state TEXT NOT NULL DEFAULT 'active',
    is_admin BOOLEAN NOT NULL DEFAULT false,
    is_current_member BOOLEAN NOT NULL DEFAULT false,
    last_activity_on TEXT,
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0011, 0013: analytics user activity
CREATE TABLE IF NOT EXISTS analytics_user_activity (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES analytics_users(gitlab_id),
    group_id BIGINT NOT NULL,
    pipeline_count INTEGER NOT NULL DEFAULT 0,
    project_count INTEGER NOT NULL DEFAULT 0,
    last_pipeline_activity TIMESTAMPTZ,
    job_count INTEGER NOT NULL DEFAULT 0,
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    commit_count INTEGER NOT NULL DEFAULT 0,
    issue_count INTEGER NOT NULL DEFAULT 0,
    merge_request_count INTEGER NOT NULL DEFAULT 0,
    push_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0
);

-- 0018: analytics user events
CREATE TABLE IF NOT EXISTS analytics_user_events (
    event_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    project_id BIGINT,
    user_id BIGINT NOT NULL REFERENCES analytics_users(gitlab_id),
    action_name TEXT NOT NULL,
    target_type TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0019: analytics user issues
CREATE TABLE IF NOT EXISTS analytics_user_issues (
    issue_id BIGINT PRIMARY KEY,
    group_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES analytics_users(gitlab_id),
    occurred_at TIMESTAMPTZ NOT NULL,
    collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0020: analytics user project relations
CREATE TABLE IF NOT EXISTS analytics_user_project_relations (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES analytics_users(gitlab_id),
    project_id          BIGINT NOT NULL REFERENCES analytics_projects(gitlab_id),
    group_id            BIGINT NOT NULL,
    relation_type       TEXT NOT NULL DEFAULT 'membership',
    evidence_type       TEXT NOT NULL DEFAULT 'unknown',
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, project_id, relation_type, evidence_type)
);

CREATE INDEX IF NOT EXISTS analytics_upr_user_id_idx ON analytics_user_project_relations (user_id);
CREATE INDEX IF NOT EXISTS analytics_upr_project_id_idx ON analytics_user_project_relations (project_id);
CREATE INDEX IF NOT EXISTS analytics_upr_group_id_idx ON analytics_user_project_relations (group_id);

-- =====================================================
-- Analytics test fixtures (group_id = 123)
-- =====================================================

-- Sync state: completed successfully
INSERT INTO analytics_sync_state (scope, last_started_at, last_completed_at, last_error, updated_at)
VALUES ('pipelines', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', NULL, NOW())
ON CONFLICT (scope) DO UPDATE SET last_started_at = EXCLUDED.last_started_at, last_completed_at = EXCLUDED.last_completed_at, last_error = EXCLUDED.last_error, updated_at = EXCLUDED.updated_at;

-- Users in analytics (must come first for FK references)
INSERT INTO analytics_users (gitlab_id, group_id, username, name, email, avatar_url, web_url, state, is_admin, is_current_member) VALUES
(11, 123, 'alice', 'Alice Johnson', 'alice@example.com', 'https://gitlab.com/avatars/alice', 'https://gitlab.com/alice', 'active', true, true),
(12, 123, 'bob', 'Bob Smith', 'bob@example.com', 'https://gitlab.com/avatars/bob', 'https://gitlab.com/bob', 'active', false, true),
(13, 123, 'carol', 'Carol Williams', 'carol@example.com', 'https://gitlab.com/avatars/carol', 'https://gitlab.com/carol', 'active', true, true),
(14, 123, 'dave', 'Dave Brown', 'dave@example.com', NULL, 'https://gitlab.com/dave', 'active', false, true),
(15, 123, 'eve', 'Eve Davis', 'eve@example.com', 'https://gitlab.com/avatars/eve', 'https://gitlab.com/eve', 'active', false, false)
ON CONFLICT (gitlab_id) DO NOTHING;

-- Projects (5 projects in group 123)
INSERT INTO analytics_projects (gitlab_id, group_id, name, path, web_url, default_branch, namespace_path, topics, jobs_enabled) VALUES
(101, 123, 'web-frontend', 'mygroup/web-frontend', 'https://gitlab.com/mygroup/web-frontend', 'main', 'mygroup', '[]', true),
(102, 123, 'api-backend', 'mygroup/api-backend', 'https://gitlab.com/mygroup/api-backend', 'main', 'mygroup', '[]', true),
(103, 123, 'mobile-app', 'mygroup/mobile-app', 'https://gitlab.com/mygroup/mobile-app', 'develop', 'mygroup', '[]', true),
(104, 123, 'data-pipeline', 'mygroup/data-pipeline', 'https://gitlab.com/mygroup/data-pipeline', 'main', 'mygroup', '["data"]', true),
(105, 123, 'infra-tools', 'mygroup/infra-tools', 'https://gitlab.com/mygroup/infra-tools', 'main', 'mygroup', '["ops"]', true)
ON CONFLICT (gitlab_id) DO NOTHING;

-- Pipelines with various statuses (within 24h)
INSERT INTO analytics_pipelines (gitlab_id, iid, project_id, sha, branch, status, source, coverage, created_at, updated_at, web_url, author_id) VALUES
(1001, 1, 101, 'abc123', 'main', 'success', 'push', 85.5, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1001', 11),
(1002, 2, 101, 'def456', 'main', 'success', 'push', 86.2, NOW() - INTERVAL '23 hours', NOW() - INTERVAL '23 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1002', 12),
(1003, 3, 101, 'ghi789', 'feature-x', 'failed', 'push', 0, NOW() - INTERVAL '22 hours', NOW() - INTERVAL '22 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1003', 11),
(1004, 4, 102, 'jkl012', 'main', 'success', 'push', 92.1, NOW() - INTERVAL '20 hours', NOW() - INTERVAL '20 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/1004', 13),
(1005, 5, 102, 'mno345', 'main', 'manual', 'merge_request_event', 0, NOW() - INTERVAL '18 hours', NOW() - INTERVAL '18 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/1005', 12),
(1006, 6, 103, 'pqr678', 'develop', 'success', 'push', 78.3, NOW() - INTERVAL '16 hours', NOW() - INTERVAL '16 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/1006', 14),
(1007, 7, 103, 'stu901', 'develop', 'failed', 'push', 0, NOW() - INTERVAL '14 hours', NOW() - INTERVAL '14 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/1007', 11),
(1008, 8, 104, 'vwx234', 'main', 'success', 'push', 88.0, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/1008', 15),
(1009, 9, 104, 'yza567', 'main', 'success', 'push', 89.5, NOW() - INTERVAL '10 hours', NOW() - INTERVAL '10 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/1009', 13),
(1010, 10, 105, 'bcd890', 'main', 'canceled', 'push', 0, NOW() - INTERVAL '8 hours', NOW() - INTERVAL '8 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/1010', 14),
(1011, 11, 101, 'efg123', 'main', 'success', 'merge_request_event', 87.0, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1011', 13),
(1012, 12, 102, 'hij456', 'main', 'success', 'push', 91.5, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/1012', 15),
(1013, 13, 101, 'klm789', 'main', 'running', 'push', NULL, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/1013', 11),
(1014, 14, 103, 'nop012', 'develop', 'success', 'push', 80.0, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/1014', 12),
(1015, 15, 104, 'qrs345', 'main', 'success', 'push', 90.2, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/1015', 14)
ON CONFLICT (gitlab_id) DO NOTHING;

-- Runner state JSON (5 runners: 2 running, 2 idle, 1 offline)
-- Format follows OLD Rust implementation: each item has nested `runner` object
-- with `online` (boolean string) and `job_execution_status` fields.
-- Top-level `status` field also present for backward compatibility.
INSERT INTO analytics_runner_state (group_id, payload, collected_at) VALUES
(123, '[
  {"runner_id": 201, "status": "running", "name": "build-runner-1", "is_shared": false, "runner": {"online": true, "job_execution_status": "running"}},
  {"runner_id": 202, "status": "running", "name": "build-runner-2", "is_shared": false, "runner": {"online": true, "job_execution_status": "running"}},
  {"runner_id": 203, "status": "idle", "name": "deploy-runner-1", "is_shared": false, "runner": {"online": true, "job_execution_status": "idle"}},
  {"runner_id": 204, "status": "idle", "name": "deploy-runner-2", "is_shared": false, "runner": {"online": true, "job_execution_status": "idle"}},
  {"runner_id": 205, "status": "offline", "name": "test-runner-1", "is_shared": false, "runner": {"online": false, "job_execution_status": "none"}}
]', NOW())
ON CONFLICT (group_id) DO UPDATE SET payload = EXCLUDED.payload, collected_at = EXCLUDED.collected_at;

-- User activity
INSERT INTO analytics_user_activity (user_id, group_id, push_count, merge_request_count, comment_count, issue_count) VALUES
(11, 123, 25, 10, 15, 5),
(12, 123, 15, 8, 10, 3),
(13, 123, 20, 12, 20, 8),
(14, 123, 10, 5, 8, 2),
(15, 123, 8, 6, 12, 10)
ON CONFLICT DO NOTHING;

-- User events (last 24h)
INSERT INTO analytics_user_events (event_id, group_id, project_id, user_id, action_name, target_type, occurred_at) VALUES
(1, 123, 101, 11, 'pushed to main', NULL, NOW() - INTERVAL '1 hour'),
(2, 123, 101, 12, 'commented on', 'merge_request', NOW() - INTERVAL '2 hours'),
(3, 123, 102, 13, 'commented on', 'note', NOW() - INTERVAL '3 hours'),
(4, 123, 103, 11, 'commented on', 'diffnote', NOW() - INTERVAL '4 hours'),
(5, 123, 104, 14, 'pushed to main', NULL, NOW() - INTERVAL '5 hours'),
(6, 123, 101, 15, 'mentioned in', 'issue', NOW() - INTERVAL '6 hours'),
(7, 123, 101, 11, 'pushed to main', NULL, NOW() - INTERVAL '71 hours'),
(8, 123, 102, 15, 'pushed to main', NULL, NOW() - INTERVAL '75 hours')
ON CONFLICT (event_id) DO NOTHING;

-- User issues
INSERT INTO analytics_user_issues (issue_id, group_id, project_id, user_id, occurred_at) VALUES
(1, 123, 101, 13, NOW() - INTERVAL '1 hour'),
(2, 123, 102, 15, NOW() - INTERVAL '3 hours'),
(3, 123, 103, 11, NOW() - INTERVAL '5 hours')
ON CONFLICT (issue_id) DO NOTHING;

-- Analytics user-project relations fixtures
-- Alice (11) -> projects 101,102 (membership + activity)
-- Bob (12) -> projects 101,103 (membership only)
-- Carol (13) -> projects 102,104 (activity only = non-active)
-- Dave (14) -> projects 103,105 (activity only = non-active)
-- Eve (15) -> projects 104 (activity only = non-active)
-- Group 123, relation_types: membership, push, mr, comment, issue, pipeline

INSERT INTO analytics_user_project_relations (user_id, project_id, group_id, relation_type, evidence_type, synced_at) VALUES
(11, 101, 123, 'membership', 'membership', NOW() - INTERVAL '1 day'),
(11, 102, 123, 'membership', 'membership', NOW() - INTERVAL '1 day'),
(11, 101, 123, 'activity', 'push', NOW() - INTERVAL '1 day'),
(11, 102, 123, 'activity', 'pipeline', NOW() - INTERVAL '23 hours'),
(12, 101, 123, 'membership', 'membership', NOW() - INTERVAL '1 day'),
(12, 103, 123, 'membership', 'membership', NOW() - INTERVAL '1 day'),
(13, 102, 123, 'activity', 'pipeline', NOW() - INTERVAL '20 hours'),
(13, 104, 123, 'activity', 'pipeline', NOW() - INTERVAL '10 hours'),
(14, 103, 123, 'activity', 'push', NOW() - INTERVAL '5 hours'),
(14, 105, 123, 'activity', 'pipeline', NOW() - INTERVAL '8 hours'),
(15, 104, 123, 'activity', 'pipeline', NOW() - INTERVAL '12 hours'),
(15, 104, 123, 'activity', 'push', NOW() - INTERVAL '6 hours'),
(13, 102, 123, 'activity', 'comment', NOW() - INTERVAL '3 hours')
ON CONFLICT DO NOTHING;

-- 0024: analytics jobs table
CREATE TABLE IF NOT EXISTS analytics_jobs (
    gitlab_id      BIGINT PRIMARY KEY,
    pipeline_id    BIGINT NOT NULL REFERENCES analytics_pipelines(gitlab_id) ON DELETE CASCADE,
    project_id     BIGINT NOT NULL REFERENCES analytics_projects(gitlab_id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    stage          TEXT NOT NULL,
    branch         TEXT NOT NULL,
    status         TEXT NOT NULL,
    allow_failure  BOOLEAN NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    web_url        TEXT NOT NULL,
    collected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analytics_jobs_pipeline_id_idx ON analytics_jobs (pipeline_id);
CREATE INDEX IF NOT EXISTS analytics_jobs_status_created_idx ON analytics_jobs (status, created_at DESC);

-- Jobs for pipeline 1001 (project 101, success)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(101, 1001, 101, 'compile', 'compile', 'main', 'success', false, NOW() - INTERVAL '1 day 2 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/101'),
(102, 1001, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '1 day 1 hour', 'https://gitlab.com/mygroup/web-frontend/-/jobs/102'),
(103, 1001, 101, 'deploy', 'deploy', 'main', 'success', true, NOW() - INTERVAL '1 day', 'https://gitlab.com/mygroup/web-frontend/-/jobs/103')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1002 (project 101, success)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(104, 1002, 101, 'compile', 'compile', 'main', 'success', false, NOW() - INTERVAL '25 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/104'),
(105, 1002, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '24 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/105'),
(106, 1002, 101, 'deploy', 'deploy', 'main', 'success', true, NOW() - INTERVAL '23 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/106')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1003 (project 101, failed)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(107, 1003, 101, 'compile', 'compile', 'feature-x', 'success', false, NOW() - INTERVAL '25 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/107'),
(108, 1003, 101, 'test', 'test', 'feature-x', 'failed', false, NOW() - INTERVAL '24 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/108')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1004 (project 102, success)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(109, 1004, 102, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '22 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/109'),
(110, 1004, 102, 'unit-test', 'test', 'main', 'success', false, NOW() - INTERVAL '21 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/110'),
(111, 1004, 102, 'integration-test', 'test', 'main', 'success', false, NOW() - INTERVAL '20 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/111'),
(112, 1004, 102, 'publish', 'deploy', 'main', 'success', true, NOW() - INTERVAL '20 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/112')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1005 (project 102, manual)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(113, 1005, 102, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '20 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/113'),
(114, 1005, 102, 'deploy-staging', 'deploy', 'main', 'success', false, NOW() - INTERVAL '19 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/114'),
(115, 1005, 102, 'deploy-production', 'deploy', 'main', 'manual', false, NOW() - INTERVAL '18 hours', 'https://gitlab.com/mygroup/api-backend/-/jobs/115')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1006 (project 103, success)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(116, 1006, 103, 'compile', 'compile', 'develop', 'success', false, NOW() - INTERVAL '18 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10016'),
(117, 1006, 103, 'lint', 'lint', 'develop', 'success', false, NOW() - INTERVAL '17 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10017'),
(118, 1006, 103, 'test', 'test', 'develop', 'success', false, NOW() - INTERVAL '16 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10018')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1007 (project 103, failed)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(119, 1007, 103, 'compile', 'compile', 'develop', 'success', false, NOW() - INTERVAL '16 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10019'),
(120, 1007, 103, 'test', 'test', 'develop', 'failed', false, NOW() - INTERVAL '15 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10020'),
(121, 1007, 103, 'package', 'package', 'develop', 'skipped', false, NOW() - INTERVAL '14 hours', 'https://gitlab.com/mygroup/mobile-app/-/jobs/10021')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1009 (project 104, success)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(122, 1009, 104, 'validate', 'validate', 'main', 'success', false, NOW() - INTERVAL '12 hours', 'https://gitlab.com/mygroup/data-pipeline/-/jobs/10024'),
(123, 1009, 104, 'process', 'process', 'main', 'success', false, NOW() - INTERVAL '11 hours', 'https://gitlab.com/mygroup/data-pipeline/-/jobs/10025'),
(124, 1009, 104, 'report', 'report', 'main', 'success', true, NOW() - INTERVAL '10 hours', 'https://gitlab.com/mygroup/data-pipeline/-/jobs/10026')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1010 (project 105, canceled)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(125, 1010, 105, 'build', 'build', 'main', 'canceled', false, NOW() - INTERVAL '10 hours', 'https://gitlab.com/mygroup/infra-tools/-/jobs/10027'),
(126, 1010, 105, 'test', 'test', 'main', 'canceled', false, NOW() - INTERVAL '9 hours', 'https://gitlab.com/mygroup/infra-tools/-/jobs/10028'),
(127, 1010, 105, 'deploy', 'deploy', 'main', 'canceled', true, NOW() - INTERVAL '8 hours', 'https://gitlab.com/mygroup/infra-tools/-/jobs/10029')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1011 (project 101, success)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
(128, 1011, 101, 'compile', 'compile', 'main', 'success', false, NOW() - INTERVAL '8 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10030'),
(129, 1011, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '7 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10031')
ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for pipeline 1013 (project 101, running)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url) VALUES
    (130, 1013, 101, 'compile', 'compile', 'main', 'success', false, NOW() - INTERVAL '2 hours 30 minutes', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10034'),
    (131, 1013, 101, 'test', 'test', 'main', 'running', false, NOW() - INTERVAL '2 hours 10 minutes', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10035'),
    (132, 1013, 101, 'deploy', 'deploy', 'main', 'pending', false, NOW() - INTERVAL '2 hours', 'https://gitlab.com/mygroup/web-frontend/-/jobs/10036')
ON CONFLICT (gitlab_id) DO NOTHING;

-- =====================================================
-- Pipelines Phase 4: Additional fixtures for pagination,
-- jobs column, and pipeline detail page testing.
-- =====================================================

-- Additional jobs for pipeline testing (multiple statuses, stages, allow_failure)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url, collected_at) VALUES
-- Jobs for pipeline 1001 (project 101, web-frontend)
(133, 1001, 101, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '1 day', 'https://gitlab.com/pipelines/1001/jobs/10001', NOW() - INTERVAL '1 day'),
(134, 1001, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '1 day', 'https://gitlab.com/pipelines/1001/jobs/10002', NOW() - INTERVAL '1 day'),
(135, 1001, 101, 'deploy', 'deploy', 'main', 'success', false, NOW() - INTERVAL '1 day', 'https://gitlab.com/pipelines/1001/jobs/10003', NOW() - INTERVAL '1 day'),

-- Jobs for pipeline 1003 (project 101, web-frontend) - one failed
(136, 1003, 101, 'build', 'build', 'feature-x', 'success', false, NOW() - INTERVAL '22 hours', 'https://gitlab.com/pipelines/1003/jobs/10004', NOW() - INTERVAL '22 hours'),
(137, 1003, 101, 'test', 'test', 'feature-x', 'failed', false, NOW() - INTERVAL '22 hours', 'https://gitlab.com/pipelines/1003/jobs/10005', NOW() - INTERVAL '22 hours'),

-- Jobs for pipeline 1013 (project 101, web-frontend) - running
(138, 1013, 101, 'build', 'build', 'main', 'running', false, NOW() - INTERVAL '2 hours', 'https://gitlab.com/pipelines/1013/jobs/10006', NOW() - INTERVAL '2 hours'),
(139, 1013, 101, 'deploy', 'deploy', 'main', 'pending', false, NOW() - INTERVAL '2 hours', 'https://gitlab.com/pipelines/1013/jobs/10007', NOW() - INTERVAL '2 hours'),

-- Jobs for pipeline 1005 (project 102, api-backend) - manual deploy
(140, 1005, 102, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '18 hours', 'https://gitlab.com/pipelines/1005/jobs/10008', NOW() - INTERVAL '18 hours'),
(141, 1005, 102, 'deploy-prod', 'deploy', 'main', 'manual', false, NOW() - INTERVAL '18 hours', 'https://gitlab.com/pipelines/1005/jobs/10009', NOW() - INTERVAL '18 hours'),

-- Jobs for pipeline 1007 (project 103, mobile-app) - failed
(142, 1007, 103, 'build', 'build', 'develop', 'success', false, NOW() - INTERVAL '14 hours', 'https://gitlab.com/pipelines/1007/jobs/10010', NOW() - INTERVAL '14 hours'),
(143, 1007, 103, 'test', 'test', 'develop', 'failed', false, NOW() - INTERVAL '14 hours', 'https://gitlab.com/pipelines/1007/jobs/10011', NOW() - INTERVAL '14 hours'),

-- Jobs for pipeline 1010 (project 105, infra-tools) - canceled
(144, 1010, 105, 'build', 'build', 'main', 'canceled', false, NOW() - INTERVAL '8 hours', 'https://gitlab.com/pipelines/1010/jobs/10012', NOW() - INTERVAL '8 hours'),

-- Jobs with allow_failure
(145, 1008, 104, 'lint', 'lint', 'main', 'success', true, NOW() - INTERVAL '12 hours', 'https://gitlab.com/pipelines/1008/jobs/10013', NOW() - INTERVAL '12 hours'),
(146, 1008, 104, 'test-integ', 'integration', 'main', 'failed', true, NOW() - INTERVAL '12 hours', 'https://gitlab.com/pipelines/1008/jobs/10014', NOW() - INTERVAL '12 hours')

ON CONFLICT (gitlab_id) DO NOTHING;

-- Additional pipelines for pagination testing (50+ total pipelines)
INSERT INTO analytics_pipelines (gitlab_id, iid, project_id, sha, branch, status, source, coverage, created_at, updated_at, web_url, author_id) VALUES
-- Project 101 web-frontend: additional pipelines
(2001, 16, 101, 'aaa111', 'main', 'success', 'push', 90.0, NOW() - INTERVAL '48 hours', NOW() - INTERVAL '48 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2001', 11),
(2002, 17, 101, 'bbb222', 'main', 'success', 'push', 91.0, NOW() - INTERVAL '52 hours', NOW() - INTERVAL '52 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2002', 12),
(2003, 18, 101, 'ccc333', 'develop', 'failed', 'push', 0, NOW() - INTERVAL '56 hours', NOW() - INTERVAL '56 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2003', 11),
(2004, 19, 101, 'ddd444', 'main', 'canceled', 'pull_request_event', NULL, NOW() - INTERVAL '60 hours', NOW() - INTERVAL '60 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2004', 13),

-- Project 102 api-backend: additional pipelines
(2005, 16, 102, 'eee555', 'main', 'success', 'push', 85.0, NOW() - INTERVAL '48 hours', NOW() - INTERVAL '48 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2005', 15),
(2006, 17, 102, 'fff666', 'main', 'failed', 'push', 0, NOW() - INTERVAL '50 hours', NOW() - INTERVAL '50 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2006', 12),
(2007, 18, 102, 'ggg777', 'develop', 'success', 'push', 80.0, NOW() - INTERVAL '54 hours', NOW() - INTERVAL '54 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2007', 11),

-- More pipelines across all projects
(2008, 19, 103, 'hhh888', 'develop', 'running', 'push', NULL, NOW() - INTERVAL '58 hours', NOW() - INTERVAL '58 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2008', 14),
(2009, 20, 104, 'iii999', 'main', 'manual', 'schedule', 95.0, NOW() - INTERVAL '62 hours', NOW() - INTERVAL '62 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2009', 15),
(2010, 21, 105, 'jjj000', 'main', 'created', 'push', NULL, NOW() - INTERVAL '66 hours', NOW() - INTERVAL '66 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/2010', 11),

-- Additional pipelines
(2011, 22, 101, 'kkk111', 'feature-y', 'success', 'push', 88.0, NOW() - INTERVAL '70 hours', NOW() - INTERVAL '70 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2011', 12),
(2012, 23, 102, 'lll222', 'feature-z', 'skipped', 'merge_request_event', NULL, NOW() - INTERVAL '74 hours', NOW() - INTERVAL '74 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2012', 13),
(2013, 24, 103, 'mmm333', 'release-v2', 'success', 'push', 82.0, NOW() - INTERVAL '78 hours', NOW() - INTERVAL '78 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2013', 14),
(2014, 25, 104, 'nnn444', 'main', 'pending', 'push', NULL, NOW() - INTERVAL '80 hours', NOW() - INTERVAL '80 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2014', 11),
(2015, 26, 101, 'ooo555', 'main', 'success', 'push', 89.5, NOW() - INTERVAL '84 hours', NOW() - INTERVAL '84 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2015', 15),
(2016, 27, 102, 'ppp666', 'main', 'success', 'schedule', 93.0, NOW() - INTERVAL '88 hours', NOW() - INTERVAL '88 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2016', 12),
(2017, 28, 103, 'qqq777', 'develop', 'running', 'push', NULL, NOW() - INTERVAL '92 hours', NOW() - INTERVAL '92 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2017', 13),
(2018, 29, 104, 'rrr888', 'main', 'success', 'push', 87.0, NOW() - INTERVAL '96 hours', NOW() - INTERVAL '96 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2018', 14),
(2019, 30, 105, 'sss999', 'main', 'failed', 'push', 0, NOW() - INTERVAL '100 hours', NOW() - INTERVAL '100 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/2019', 11),
(2020, 31, 101, 'ttt000', 'main', 'success', 'push', 91.5, NOW() - INTERVAL '104 hours', NOW() - INTERVAL '104 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2020', 12),
(2021, 32, 101, 'uuu111', 'main', 'success', 'push', 92.0, NOW() - INTERVAL '108 hours', NOW() - INTERVAL '108 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2021', 13),
(2022, 33, 101, 'vvv222', 'main', 'canceled', 'push', NULL, NOW() - INTERVAL '112 hours', NOW() - INTERVAL '112 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2022', 14),
(2023, 34, 102, 'www333', 'main', 'success', 'push', 84.0, NOW() - INTERVAL '116 hours', NOW() - INTERVAL '116 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2023', 15),
(2024, 35, 102, 'xxx444', 'develop', 'failed', 'push', 0, NOW() - INTERVAL '120 hours', NOW() - INTERVAL '120 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2024', 11),
(2025, 36, 103, 'yyy555', 'develop', 'success', 'schedule', 86.0, NOW() - INTERVAL '124 hours', NOW() - INTERVAL '124 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2025', 12),
(2026, 37, 104, 'zzz666', 'main', 'pending', 'push', NULL, NOW() - INTERVAL '128 hours', NOW() - INTERVAL '128 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2026', 13),
(2027, 38, 105, 'aaa777', 'main', 'success', 'push', 90.5, NOW() - INTERVAL '132 hours', NOW() - INTERVAL '132 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/2027', 14),
(2028, 39, 101, 'bbb888', 'main', 'success', 'web', 91.0, NOW() - INTERVAL '136 hours', NOW() - INTERVAL '136 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2028', 15),
(2029, 40, 102, 'ccc999', 'main', 'created', 'trigger', NULL, NOW() - INTERVAL '140 hours', NOW() - INTERVAL '140 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2029', 11),
(2030, 41, 103, 'ddd000', 'main', 'manual', 'api', NULL, NOW() - INTERVAL '144 hours', NOW() - INTERVAL '144 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2030', 12),
(2031, 42, 104, 'eee111', 'main', 'success', 'push', 88.5, NOW() - INTERVAL '148 hours', NOW() - INTERVAL '148 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2031', 13),
(2032, 43, 105, 'fff222', 'feature-ops', 'success', 'push', 87.5, NOW() - INTERVAL '152 hours', NOW() - INTERVAL '152 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/2032', 14),
(2033, 44, 101, 'ggg333', 'main', 'preparing', 'push', NULL, NOW() - INTERVAL '156 hours', NOW() - INTERVAL '156 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2033', 15),
(2034, 45, 102, 'hhh444', 'main', 'waiting_for_resource', 'push', NULL, NOW() - INTERVAL '160 hours', NOW() - INTERVAL '160 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2034', 11),
(2035, 46, 101, 'iii555', 'main', 'success', 'push', 93.0, NOW() - INTERVAL '164 hours', NOW() - INTERVAL '164 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2035', 12),
(2036, 47, 102, 'jjj666', 'main', 'skipped', 'push', NULL, NOW() - INTERVAL '168 hours', NOW() - INTERVAL '168 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2036', 13),
(2037, 48, 103, 'kkk777', 'develop', 'success', 'push', 81.0, NOW() - INTERVAL '172 hours', NOW() - INTERVAL '172 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2037', 14),
(2038, 49, 104, 'lll888', 'main', 'success', 'schedule', 96.0, NOW() - INTERVAL '176 hours', NOW() - INTERVAL '176 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2038', 15)

ON CONFLICT (gitlab_id) DO NOTHING;

-- Jobs for the additional pipelines (2001-2038)
INSERT INTO analytics_jobs (gitlab_id, pipeline_id, project_id, name, stage, branch, status, allow_failure, created_at, web_url, collected_at) VALUES
(147, 2001, 101, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '48 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2001/jobs/20001', NOW() - INTERVAL '48 hours'),
(148, 2001, 101, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '48 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2001/jobs/20002', NOW() - INTERVAL '48 hours'),
(149, 2003, 101, 'build', 'build', 'feature-x', 'success', false, NOW() - INTERVAL '56 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2003/jobs/20003', NOW() - INTERVAL '56 hours'),
(150, 2003, 101, 'test', 'test', 'feature-x', 'failed', true, NOW() - INTERVAL '56 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2003/jobs/20004', NOW() - INTERVAL '56 hours'),
(151, 2002, 101, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '52 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2002/jobs/20005', NOW() - INTERVAL '52 hours'),
(152, 2004, 101, 'build', 'build', 'main', 'canceled', false, NOW() - INTERVAL '60 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2004/jobs/20006', NOW() - INTERVAL '60 hours'),
(153, 2005, 102, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '48 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2005/jobs/20007', NOW() - INTERVAL '48 hours'),
(154, 2005, 102, 'test', 'test', 'main', 'success', false, NOW() - INTERVAL '48 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2005/jobs/20008', NOW() - INTERVAL '48 hours'),
(155, 2006, 102, 'build', 'build', 'main', 'failed', false, NOW() - INTERVAL '50 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2006/jobs/20009', NOW() - INTERVAL '50 hours'),
(156, 2007, 102, 'build', 'build', 'develop', 'success', false, NOW() - INTERVAL '54 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2007/jobs/20010', NOW() - INTERVAL '54 hours'),
(157, 2008, 103, 'build', 'build', 'develop', 'running', false, NOW() - INTERVAL '58 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2008/jobs/20011', NOW() - INTERVAL '58 hours'),
(158, 2009, 104, 'build', 'build', 'main', 'manual', false, NOW() - INTERVAL '62 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2009/jobs/20012', NOW() - INTERVAL '62 hours'),
(159, 2010, 105, 'build', 'build', 'main', 'created', false, NOW() - INTERVAL '66 hours', 'https://gitlab.com/mygroup/infra-tools/-/pipelines/2010/jobs/20013', NOW() - INTERVAL '66 hours'),
(160, 2012, 102, 'build', 'build', 'feature-z', 'skipped', false, NOW() - INTERVAL '74 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2012/jobs/20014', NOW() - INTERVAL '74 hours'),
(161, 2013, 103, 'build', 'build', 'release-v2', 'success', false, NOW() - INTERVAL '78 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2013/jobs/20015', NOW() - INTERVAL '78 hours'),
(162, 2014, 104, 'build', 'build', 'main', 'pending', false, NOW() - INTERVAL '80 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2014/jobs/20016', NOW() - INTERVAL '80 hours'),
(163, 2015, 101, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '84 hours', 'https://gitlab.com/mygroup/web-frontend/-/pipelines/2015/jobs/20017', NOW() - INTERVAL '84 hours'),
(164, 2016, 102, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '88 hours', 'https://gitlab.com/mygroup/api-backend/-/pipelines/2016/jobs/20018', NOW() - INTERVAL '88 hours'),
(165, 2017, 103, 'build', 'build', 'develop', 'running', false, NOW() - INTERVAL '92 hours', 'https://gitlab.com/mygroup/mobile-app/-/pipelines/2017/jobs/20019', NOW() - INTERVAL '92 hours'),
(166, 2018, 104, 'build', 'build', 'main', 'success', false, NOW() - INTERVAL '96 hours', 'https://gitlab.com/mygroup/data-pipeline/-/pipelines/2018/jobs/20020', NOW() - INTERVAL '96 hours')

ON CONFLICT (gitlab_id) DO NOTHING;

-- Ensure sync state shows completed (readiness = true)
INSERT INTO analytics_sync_state (scope, last_started_at, last_completed_at, last_error, updated_at)
VALUES ('pipelines', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '1 hour', NULL, NOW())
ON CONFLICT (scope) DO UPDATE SET
  last_started_at = EXCLUDED.last_started_at,
  last_completed_at = EXCLUDED.last_completed_at,
  last_error = EXCLUDED.last_error,
  updated_at = EXCLUDED.updated_at;
