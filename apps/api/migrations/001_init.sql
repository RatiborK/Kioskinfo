-- apps/api/migrations/001_init.sql — initial storage, no passwords or secrets committed.
-- PostgreSQL 18 provides gen_random_uuid() natively; no extension privileges needed.
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (length(username) BETWEEN 1 AND 80),
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash char(64) PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_-]{1,80}$'),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  published jsonb,
  published_revision integer,
  published_at timestamptz,
  updated_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
INSERT INTO pages (slug, title, body, published, published_revision)
VALUES ('welcome','Добро пожаловать','Дворец культуры «Кировский». Актуальная информация и мероприятия появятся здесь.','{"title":"Добро пожаловать","body":"Дворец культуры «Кировский». Актуальная информация и мероприятия появятся здесь."}'::jsonb,1)
ON CONFLICT (slug) DO NOTHING;
