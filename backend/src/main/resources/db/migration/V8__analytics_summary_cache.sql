-- V8__analytics_summary_cache.sql
-- Ported from 0008_analytics_summary_cache.sql
-- Cached analytics summaries for dashboard performance

CREATE TABLE IF NOT EXISTS analytics_summary_cache (
  cache_key TEXT PRIMARY KEY,
  group_ids BIGINT[] NOT NULL,
  hours INTEGER NOT NULL,
  pipeline_view TEXT NOT NULL,
  payload JSONB NOT NULL,
  source_completed_epoch BIGINT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analytics_summary_cache_computed_at
  ON analytics_summary_cache(computed_at);
CREATE INDEX IF NOT EXISTS idx_analytics_summary_cache_pipeline_view
  ON analytics_summary_cache(pipeline_view);
