-- apps/api/migrations/002_schedule_web.sql — canonical schedule cards edited through the web UI.
CREATE TABLE IF NOT EXISTS schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 70),
  group_name text NOT NULL CHECK(length(group_name) BETWEEN 1 AND 140),
  leader text NOT NULL DEFAULT '',
  meeting_time text NOT NULL DEFAULT '',
  room text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  age text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT 'orange' CHECK(theme IN ('orange','blue','neutral')),
  inherit_theme boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 1000000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision >= 1),
  published jsonb,
  published_revision integer,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS schedule_items_active_idx ON schedule_items(position,created_at,id) WHERE archived_at IS NULL;
