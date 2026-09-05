-- V23__project_namespace_group_id.sql
-- Ported from 0023_project_namespace_group_id.sql
-- Namespace IDs for the Relations Map user->group->project graph

ALTER TABLE analytics_projects
    ADD COLUMN IF NOT EXISTS namespace_id BIGINT,
    ADD COLUMN IF NOT EXISTS namespace_parent_id BIGINT;
CREATE INDEX IF NOT EXISTS analytics_projects_namespace_id_idx ON analytics_projects (namespace_id);
