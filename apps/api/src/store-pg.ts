// apps/api/src/store-pg.ts — parameterised SQL queries and optimistic revisions.
import pg from 'pg';
import type { Account, Page, PublicContent, Session, Store } from './model.js';
const { Pool } = pg;
export function makePool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error('DATABASE_URL не задан. Сервер не запускается без базы данных.');
  return new Pool({ connectionString, max: 4, idleTimeoutMillis: 20000, connectionTimeoutMillis: 5000 });
}
function pageFromDb(row: Record<string, unknown>): Page {
  return {
    id: String(row.id), slug: String(row.slug), title: String(row.title), body: String(row.body),
    revision: Number(row.revision), published: (row.published as PublicContent | null) ?? null,
    published_revision: row.published_revision === null ? null : Number(row.published_revision),
    updated_at: new Date(row.updated_at as Date | string).toISOString(),
  };
}
export class PgStore implements Store {
  constructor(private readonly pool: pg.Pool) {}
  async findAccountByUsername(username: string): Promise<Account | null> {
    const r = await this.pool.query<Account>('SELECT id, username, display_name, role, password_hash, enabled FROM accounts WHERE username = $1', [username]);
    return r.rows[0] ?? null;
  }
  async findAccountById(id: string): Promise<Account | null> {
    const r = await this.pool.query<Account>('SELECT id, username, display_name, role, password_hash, enabled FROM accounts WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  }
  async createSession(tokenHash: string, accountId: string, expiresAt: Date): Promise<void> {
    await this.pool.query('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, accountId, expiresAt]);
  }
  async getSession(token: string): Promise<Session | null> {
    const r = await this.pool.query<Session>('SELECT account_id, expires_at FROM sessions WHERE token_hash = $1 AND expires_at > now()', [token]);
    return r.rows[0] ?? null;
  }
  async deleteSession(token: string): Promise<void> { await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [token]); }
  async listPages(): Promise<Page[]> {
    const r = await this.pool.query('SELECT * FROM pages ORDER BY title');
    return r.rows.map(pageFromDb);
  }
  async getPage(id: string): Promise<Page | null> {
    const r = await this.pool.query('SELECT * FROM pages WHERE id::text = $1 OR slug = $1 LIMIT 1', [id]);
    return r.rows[0] ? pageFromDb(r.rows[0]) : null;
  }
  async getPublishedBySlug(slug: string): Promise<PublicContent | null> {
    const r = await this.pool.query<{published: PublicContent | null}>('SELECT published FROM pages WHERE slug = $1', [slug]);
    return r.rows[0]?.published ?? null;
  }
  async updateDraft(id: string, expectedRevision: number, content: PublicContent, actorId: string): Promise<Page | null> {
    const r = await this.pool.query('UPDATE pages SET title=$3, body=$4, revision=revision+1, updated_by=$5, updated_at=now() WHERE (id::text=$1 OR slug=$1) AND revision=$2 RETURNING *', [id, expectedRevision, content.title, content.body, actorId]);
    return r.rows[0] ? pageFromDb(r.rows[0]) : null;
  }
  async publish(id: string, expectedRevision: number, actorId: string): Promise<Page | null> {
    const r = await this.pool.query("UPDATE pages SET published=jsonb_build_object('title', title, 'body', body), published_revision=revision, published_at=now(), updated_by=$3 WHERE (id::text=$1 OR slug=$1) AND revision=$2 RETURNING *", [id, expectedRevision, actorId]);
    return r.rows[0] ? pageFromDb(r.rows[0]) : null;
  }
  async audit(actorId: string | null, action: string, details: Record<string, unknown>): Promise<void> {
    await this.pool.query('INSERT INTO audit_events (actor_id, action, details) VALUES ($1,$2,$3::jsonb)', [actorId, action, JSON.stringify(details)]);
  }
}
