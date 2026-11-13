// desktop/lib/store.cjs — persistent single-PC admin and page store; never ships a default password.
'use strict';
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

async function writeAtomic(file, value) {
  const temp = file + '.' + randomUUID() + '.tmp';
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
async function loadOptional(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error('Не удалось прочитать данные приложения: ' + file, { cause: err });
  }
}
class DesktopStore {
  constructor(dir) {
    this.dir = dir;
    this.accountsFile = path.join(dir, 'admin.json');
    this.pagesFile = path.join(dir, 'pages.json');
    this.sessions = new Map();
    this.admin = null;
    this.pages = [];
    this.queue = Promise.resolve();
  }
  static async open(dir) {
    const store = new DesktopStore(dir);
    const account = await loadOptional(store.accountsFile, null);
    if (account !== null && (
      !account || typeof account !== 'object' || account.username !== 'admin' ||
      account.role !== 'admin' || !/^[a-f0-9-]{36}$/i.test(account.id || '') ||
      typeof account.password_hash !== 'string' || !account.password_hash.startsWith('scrypt$')
    )) throw new Error('Повреждён сохранённый профиль администратора. Создайте резервную копию перед восстановлением.');
    store.admin = account;
    const rows = await loadOptional(store.pagesFile, null);
    if (rows !== null && (!Array.isArray(rows) || rows.length > 500)) throw new Error('Повреждены страницы приложения');
    store.pages = rows || [{
      id: randomUUID(), slug: 'welcome', title: 'ДК «Кировский»',
      body: 'Информационная платформа НавиКультура', revision: 1,
      published: { title: 'ДК «Кировский»', body: 'Информационная платформа НавиКультура' },
      published_revision: 1, updated_at: new Date().toISOString(),
    }];
    return store;
  }
  get initialized() { return !!this.admin; }
  async initializeAdmin(password, hashPassword) {
    if (this.admin) throw new Error('Учётная запись уже создана');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128)
      throw new Error('Пароль должен содержать от 12 до 128 символов');
    const account = {
      id: randomUUID(), username: 'admin', display_name: 'Администратор ДК',
      role: 'admin', enabled: true, password_hash: await hashPassword(password),
    };
    // flag wx prevents overwriting existing credentials on subsequent launches.
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.accountsFile, JSON.stringify(account, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    this.admin = account;
  }
  async findAccountByUsername(name) { return this.admin?.username === name ? this.admin : null; }
  async findAccountById(id) { return this.admin?.id === id ? this.admin : null; }
  async createSession(hash, accountId, expiresAt) { this.sessions.set(hash, { account_id: accountId, expires_at: expiresAt.toISOString() }); }
  async getSession(hash) {
    const session = this.sessions.get(hash);
    return session && Date.parse(session.expires_at) > Date.now() ? session : null;
  }
  async deleteSession(hash) { this.sessions.delete(hash); }
  async listPages() { return structuredClone(this.pages); }
  async getPage(id) { return structuredClone(this.pages.find(x => x.id === id || x.slug === id) || null); }
  async getPublishedBySlug(slug) { return structuredClone(this.pages.find(x => x.slug === slug)?.published || null); }
  async exclusive(fn) {
    const result = this.queue.then(fn);
    this.queue = result.then(() => {}, () => {});
    return result;
  }
  async updateDraft(id, expectedRevision, content) {
    return this.exclusive(async () => {
      const row = this.pages.find(x => x.id === id || x.slug === id);
      if (!row || row.revision !== expectedRevision) return null;
      const next = { ...row, ...content, revision: row.revision + 1, updated_at: new Date().toISOString() };
      const nextPages = this.pages.map(x => x.id === row.id ? next : x);
      await writeAtomic(this.pagesFile, nextPages);
      this.pages = nextPages;
      return structuredClone(next);
    });
  }
  async publish(id, expectedRevision) {
    return this.exclusive(async () => {
      const row = this.pages.find(x => x.id === id || x.slug === id);
      if (!row || row.revision !== expectedRevision) return null;
      const next = { ...row, published: { title: row.title, body: row.body },
        published_revision: row.revision, updated_at: new Date().toISOString() };
      const nextPages = this.pages.map(x => x.id === row.id ? next : x);
      await writeAtomic(this.pagesFile, nextPages);
      this.pages = nextPages;
      return structuredClone(next);
    });
  }
  async audit(_actor, action, details = {}) {
    const event = JSON.stringify({ time: new Date().toISOString(), action, details }) + '\n';
    await fs.mkdir(this.dir, { recursive: true });
    await fs.appendFile(path.join(this.dir, 'audit.jsonl'), event, { mode: 0o600 });
  }
}
module.exports = { DesktopStore };
