-- apps/api/migrations/003_visitor_themes.sql
-- Whole-kiosk theme selection; intentionally separate from per-card formatting.
CREATE TABLE IF NOT EXISTS visitor_theme_settings(
  id integer PRIMARY KEY CHECK(id=1),
  draft text NOT NULL DEFAULT 'dk' CHECK(draft IN ('dk','holiday','modern','aurora','poster','gallery','neon','kids')),
  published text NOT NULL DEFAULT 'dk' CHECK(published IN ('dk','holiday','modern','aurora','poster','gallery','neon','kids')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
  published_revision integer NOT NULL DEFAULT 1 CHECK(published_revision>=1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(published_revision<=revision)
);
INSERT INTO visitor_theme_settings(id,draft,published) VALUES(1,'dk','dk') ON CONFLICT(id) DO NOTHING;
