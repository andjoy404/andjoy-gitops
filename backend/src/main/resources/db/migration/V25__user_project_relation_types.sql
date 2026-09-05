-- V25__user_project_relation_types.sql
-- The Relations Map graph (GraphService.getUserProjectGraph) selects
-- relation_type and evidence_type from analytics_user_project_relations,
-- but V21 created the table without these columns, so the graph query
-- fails with "column r.relation_type does not exist" on databases that
-- were migrated only through V24.
--
-- Both columns are NOT NULL with safe defaults, matching the H2 and test
-- PostgreSQL schemas. Existing rows are backfilled in place with the
-- defaults (relations were historically written as membership evidence;
-- 'unknown' is the conservative evidence marker). No row is modified
-- beyond adding the two defaulted columns.

ALTER TABLE analytics_user_project_relations
    ADD COLUMN IF NOT EXISTS relation_type TEXT NOT NULL DEFAULT 'membership',
    ADD COLUMN IF NOT EXISTS evidence_type TEXT NOT NULL DEFAULT 'unknown';
