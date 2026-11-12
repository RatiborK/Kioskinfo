// apps/api/src/model.ts — explicit domain/storage contracts; no direct DB access in routes.
export type Role = 'admin' | 'editor' | 'viewer';
export interface Account {
  id: string; username: string; display_name: string; role: Role;
  password_hash: string; enabled: boolean;
}
export interface PublicContent { title: string; body: string }
export interface Page {
  id: string; slug: string; title: string; body: string; revision: number;
  published: PublicContent | null; published_revision: number | null;
  updated_at: string;
}
export interface Session { account_id: string; expires_at: string }
export interface Store {
  findAccountByUsername(username: string): Promise<Account | null>;
  findAccountById(id: string): Promise<Account | null>;
  createSession(tokenHash: string, accountId: string, expiresAt: Date): Promise<void>;
  getSession(tokenHash: string): Promise<Session | null>;
  deleteSession(tokenHash: string): Promise<void>;
  listPages(): Promise<Page[]>;
  getPage(id: string): Promise<Page | null>;
  getPublishedBySlug(slug: string): Promise<PublicContent | null>;
  // Distinguish not-found from optimistic-revision conflict by route-level read after failure.
  updateDraft(id: string, expectedRevision: number, content: PublicContent, actorId: string): Promise<Page | null>;
  publish(id: string, expectedRevision: number, actorId: string): Promise<Page | null>;
  audit(actorId: string | null, action: string, details: Record<string, unknown>): Promise<void>;
}
