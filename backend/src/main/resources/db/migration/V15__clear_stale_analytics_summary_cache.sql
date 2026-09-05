-- V15__clear_stale_analytics_summary_cache.sql
-- Ported from 0015_clear_stale_analytics_summary_cache.sql
-- Clear stale cache entries during schema upgrade

DELETE FROM analytics_summary_cache;
