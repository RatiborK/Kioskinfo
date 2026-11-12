-- apps/api/migrations/005_culture_content.sql
-- Publishable cultural content with optimistic revisions. Initial seed must be applied
-- from the validated source content in the application, not invented by the migration.
CREATE TABLE IF NOT EXISTS culture_content(
 id integer PRIMARY KEY CHECK(id=1),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 published_revision integer NOT NULL DEFAULT 1 CHECK(published_revision>=1),
 draft jsonb NOT NULL,
 published jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(published_revision<=revision)
);
-- The application bootstrap should insert id=1 from starterContent after review;
-- PostgreSQL production is not enabled before migration/initialisation.
