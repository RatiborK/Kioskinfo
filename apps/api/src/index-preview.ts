// apps/api/src/index-preview.ts — read-only localhost preview of posters and XLSX schedules.
// No account creation, no database, and no writes are possible from the browser in this mode.
import { createApp } from './app.js';
import { FolderPosterRepository } from './posters.js';
import { XlsxScheduleRepository } from './schedule.js';
import type { Store } from './model.js';
const store: Store = {
  async findAccountByUsername() { return null; },
  async findAccountById() { return null; },
  async createSession() { throw new Error('Preview mode has no sessions'); },
  async getSession() { return null; },
  async deleteSession() {},
  async listPages() { return []; },
  async getPage() { return null; },
  async getPublishedBySlug(slug) { return slug === 'welcome' ? {title:'ДК «Кировский»', body:'Информационная платформа НавиКультура'} : null; },
  async updateDraft() { return null; },
  async publish() { return null; },
  async audit() {},
};
const app = createApp({store, posters:new FolderPosterRepository(), schedule:new XlsxScheduleRepository(), allowedOrigin:'http://127.0.0.1:5173'});
try {
  await app.listen({host:'127.0.0.1',port:3100});
  process.stdout.write('Preview: http://127.0.0.1:3100 (без PostgreSQL, только чтение)\n');
} catch (error) { app.log.error(error); process.exitCode=1; await app.close(); }
process.once('SIGINT', ()=>void app.close());
process.once('SIGTERM', ()=>void app.close());
