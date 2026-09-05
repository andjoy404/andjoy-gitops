-- V21__user_project_relations.sql
-- Ported from 0021_user_project_relations.sql
-- User -> Project relationship graph for Relations Map feature

CREATE TABLE IF NOT EXISTS analytics_user_project_relations (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES analytics_users(gitlab_id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES analytics_projects(gitlab_id) ON DELETE CASCADE,
    group_id BIGINT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, project_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_analytics_user_project_relations_user ON analytics_user_project_relations(user_id, group_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_project_relations_project ON analytics_user_project_relations(project_id, group_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_project_relations_group ON analytics_user_project_relations(group_id);
