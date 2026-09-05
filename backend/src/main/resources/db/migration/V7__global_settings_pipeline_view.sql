-- V7__global_settings_pipeline_view.sql
-- Ported from 0007_add_pipeline_view_global_setting.sql
-- Add pipeline_view setting to global settings

ALTER TABLE app_global_settings
  ADD COLUMN IF NOT EXISTS pipeline_view TEXT NOT NULL DEFAULT 'all';

UPDATE app_global_settings
  SET pipeline_view = 'all'
  WHERE pipeline_view IS NULL;
