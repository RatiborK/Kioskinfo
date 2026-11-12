-- apps/api/migrations/004_cultural_events.sql — published calendar independent of schedule.
CREATE TABLE IF NOT EXISTS cultural_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  draft jsonb NOT NULL,
  published jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS cultural_events_active_idx ON cultural_events(id) WHERE archived_at IS NULL;
