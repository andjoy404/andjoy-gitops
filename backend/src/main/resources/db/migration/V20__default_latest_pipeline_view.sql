-- V20__default_latest_pipeline_view.sql
-- Ported from 0020_default_latest_pipeline_view.sql
-- Update default pipeline view from 'all' to 'latest'

UPDATE app_global_settings
  SET pipeline_view = 'latest'
  WHERE pipeline_view = 'all';
