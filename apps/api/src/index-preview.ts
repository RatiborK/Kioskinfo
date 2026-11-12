// apps/api/src/index-preview.ts — isolated, read-only preview with no database or accounts.
// This entrypoint is strictly bound to 127.0.0.1 and cannot authorize edits.
import { createApp } from './app.js';
import { FolderPosterRepository } from './posters.js';
import type { Store } from './model.js';

const previewStore: Store = {
  async findAccountByUsername() { return null; },
  async findAccountById() { return null; },
  async createSession() { throw new Error('Preview does not create sessions'); },
  async getSession() { return null; },
  async deleteSession() {},
  async listPages() { return []; },
  async getPage() { return null; },
  async getPublishedBySlug(slug) {
    return slug === 'welcome'
      ? { title: 'ДК «Кировский»', body: 'НавиКультура: локальный просмотр афиш. Реальные материалы добавляются через папку content/posters.' }
      : null;
  },
  async updateDraft() { return null; },
  async publish() { return null; },
  async audit() {},
};
const app = createApp({ store: previewStore, posters: new FolderPosterRepository(), allowedOrigin: 'http://127.0.0.1:5173' });
try {
  await app.listen({ host: '127.0.0.1', port: 3100 });
  process.stdout.write('НавиКультура: локальный просмотр без PostgreSQL, http://127.0.0.1:3100\n');
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
}
process.once('SIGINT', () => void app.close());
process.once('SIGTERM', () => void app.close());
