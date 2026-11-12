-- Stage 04.1: safe, versioned button appearance (no migration of user content).
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS appearance jsonb NOT NULL
  DEFAULT '{"fill":"outline","radius":"square","titleSize":"normal","align":"left"}'::jsonb;
-- Published jsonb snapshots remain untouched and are read with legacy defaults.
