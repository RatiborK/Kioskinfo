// apps/api/src/migrate.ts — serialised, checksum-pinned SQL migrations.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { makePool } from './store-pg.js';
const pool = makePool();
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(8832026)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const names = readdirSync(dir).filter(name=> /^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();
    if (!names.length) throw new Error('SQL миграции не найдены');
    for(const name of names) {
      const sql = readFileSync(resolve(dir,name),'utf8');
      const sha = createHash('sha256').update(sql).digest('hex');
      const installed = await client.query<{sha256:string}>('SELECT sha256 FROM schema_migrations WHERE name=$1',[name]);
      if(installed.rows[0]) { if(installed.rows[0].sha256!==sha) throw new Error(`Миграция ${name} изменена после применения`); continue; }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name,sha256) VALUES ($1,$2)',[name,sha]);
      process.stdout.write(`Applied ${name}\n`);
    }
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
try { await run(); } finally { await pool.end(); }
