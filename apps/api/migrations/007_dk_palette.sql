-- apps/api/migrations/007_dk_palette.sql
-- Opt-in DK palette; previous themes and published content stay unchanged.
ALTER TABLE visitor_theme_settings
  ADD COLUMN IF NOT EXISTS dk_background text NOT NULL DEFAULT '#2c3e50'
    CHECK (dk_background ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE visitor_theme_settings
  ADD COLUMN IF NOT EXISTS dk_glow text NOT NULL DEFAULT '#4ca1af'
    CHECK (dk_glow ~ '^#[0-9a-fA-F]{6}$');
