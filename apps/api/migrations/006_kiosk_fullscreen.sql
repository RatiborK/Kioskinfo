-- apps/api/migrations/006_kiosk_fullscreen.sql
-- Non-destructive, opt-in kiosk fullscreen preference.
ALTER TABLE visitor_theme_settings
  ADD COLUMN IF NOT EXISTS fullscreen_enabled boolean NOT NULL DEFAULT false;
