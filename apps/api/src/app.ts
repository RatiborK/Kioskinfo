// apps/api/src/app.ts — LAN editor with session authentication, role checks and revision-safe autosave.
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { createSessionToken, tokenHash, verifyPassword } from './crypto.js';
import type { Account, PublicContent, Store } from './model.js';
import { posterFileStream, type PosterRepository } from './posters.js';

export interface AppOptions { store: Store; posters?: PosterRepository; cookieSecure?: boolean; allowedOrigin?: string }
const MAX_AGE_S = 8 * 60 * 60;
const ID = /^[a-z0-9_-]{1,80}$/i;
const cookieName = (secure: boolean) => secure ? '__Host-navikultura_sid' : 'navikultura_dev_sid';
function readCookie(request: FastifyRequest, name: string): string | null {
  const pair = (request.headers.cookie ?? '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : null;
}
function cookieHeader(token: string, secure: boolean, maxAge: number): string {
  return `${cookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function userPublic(account: Account) {
  return { id: account.id, username: account.username, displayName: account.display_name, role: account.role };
}
export function createApp(options: AppOptions) {
  const app = Fastify({ logger: false, bodyLimit: 11_000_000 });
  const { store, posters, cookieSecure = false, allowedOrigin } = options;
  const failedLogins = new Map<string, { count: number; windowStart: number }>();
  const mutating = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
  app.addHook('onRequest', async (request, reply) => {
    if (!mutating.has(request.method)) return;
    // JSON + a custom header and SameSite=Strict protect against ordinary cross-site form submissions.
    if (request.headers['x-navikultura-action'] !== '1') return reply.code(403).send({ error: 'Необходим заголовок X-Navikultura-Action' });
    if (!request.headers['content-type']?.startsWith('application/json')) return reply.code(415).send({ error: 'Ожидается JSON' });
    const origin = request.headers.origin;
    if (origin && allowedOrigin && origin !== allowedOrigin) return reply.code(403).send({ error: 'Источник запроса не разрешён' });
    if (origin && !allowedOrigin) return reply.code(403).send({ error: 'Разрешённый адрес редактора не настроен' });
  });
  async function currentUser(request: FastifyRequest): Promise<Account | null> {
    const raw = readCookie(request, cookieName(cookieSecure));
    if (!raw || !/^[A-Za-z0-9_-]{32,64}$/.test(raw)) return null;
    const session = await store.getSession(tokenHash(raw));
    if (!session) return null;
    const user = await store.findAccountById(session.account_id);
    return user?.enabled ? user : null;
  }
  async function requireRole(request: FastifyRequest, reply: FastifyReply, roles: Account['role'][]): Promise<Account | null> {
    const account = await currentUser(request);
    if (!account) { reply.code(401).send({ error: 'Войдите в систему' }); return null; }
    if (!roles.includes(account.role)) { reply.code(403).send({ error: 'Недостаточно прав' }); return null; }
    return account;
  }
  app.get('/api/health', async () => ({ status: 'ok', service: 'navikultura-api', phase: 'stage-01' }));
  app.get('/api/public/navigation', async () => ({
    status: 'demo', sections: [
      { id: 'posters', title: 'Афиша' }, { id: 'schedule', title: 'Расписание' },
      { id: 'groups', title: 'Коллективы' }, { id: 'navigation', title: 'Навигация' },
      { id: 'about', title: 'О ДК' }, { id: 'contacts', title: 'Контакты' },
    ],
  }));
  // Posters are discovered directly from the configured local folder.
  app.get('/api/public/posters', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return posters ? await posters.list() : { posters: [], ignored: 0 };
  });
  app.get<{ Params: { name: string } }>('/api/public/posters/:name/file', async (request, reply) => {
    const media = await posters?.media(request.params.name);
    if (!media) return reply.code(404).send({ error: 'Материал не найден' });
    reply.header('Content-Type', media.mime);
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Length', media.sizeBytes);
    return reply.send(posterFileStream(media.filePath));
  });
  app.post<{ Body: { name?: string; base64?: string } }>('/api/editor/posters', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor']);
    if (!account) return;
    if (!posters) return reply.code(503).send({ error: 'Папка афиш не настроена' });
    if (typeof request.body?.name !== 'string' || typeof request.body?.base64 !== 'string')
      return reply.code(400).send({ error: 'Укажите файл изображения' });
    try {
      const item = await posters.upload(request.body.name, request.body.base64);
      await store.audit(account.id, 'poster.upload', { name: item.name, bytes: item.sizeBytes });
      return reply.code(201).send({ poster: item });
    } catch (error) {
      if (error instanceof Error && ['INVALID_FILENAME','INVALID_MEDIA','UPLOAD_IMAGE_ONLY'].includes(error.message))
        return reply.code(400).send({ error: 'Нужен корректный JPG, PNG или WebP размером до 8 МБ' });
      throw error;
    }
  });
  app.delete<{ Params: { name: string } }>('/api/editor/posters/:name', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor']);
    if (!account) return;
    if (!posters) return reply.code(503).send({ error: 'Папка афиш не настроена' });
    const removed = await posters.remove(request.params.name);
    if (!removed) return reply.code(404).send({ error: 'Афиша не найдена' });
    await store.audit(account.id, 'poster.delete', { name: request.params.name });
    return { status: 'ok' };
  });
  app.get<{ Params: { slug: string } }>('/api/public/pages/:slug', async (request, reply) => {
    if (!ID.test(request.params.slug)) return reply.code(400).send({ error: 'Некорректный адрес страницы' });
    const page = await store.getPublishedBySlug(request.params.slug);
    if (!page) return reply.code(404).send({ error: 'Страница не опубликована' });
    return { page };
  });
  app.post<{ Body: { username?: string; password?: string } }>('/api/auth/login', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string'
      || body.username.length > 80 || body.password.length > 128) return reply.code(400).send({ error: 'Неправильный формат' });
    const username = body.username.trim().toLowerCase();
    if (!ID.test(username)) return reply.code(400).send({ error: 'Некорректное имя пользователя' });
    const key = `${request.ip}:${username}`;
    const now = Date.now();
    const attempt = failedLogins.get(key) ?? { count: 0, windowStart: now };
    if (now - attempt.windowStart > 15 * 60_000) { attempt.count = 0; attempt.windowStart = now; }
    if (attempt.count >= 8) return reply.code(429).send({ error: 'Слишком много попыток. Повторите через 15 минут' });
    const account = await store.findAccountByUsername(username);
    const valid = account?.enabled ? await verifyPassword(body.password, account.password_hash) : false;
    if (!valid || !account) {
      attempt.count += 1; failedLogins.set(key, attempt);
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }
    failedLogins.delete(key);
    const token = createSessionToken();
    await store.createSession(tokenHash(token), account.id, new Date(now + MAX_AGE_S * 1000));
    reply.header('Set-Cookie', cookieHeader(token, cookieSecure, MAX_AGE_S));
    reply.header('Cache-Control', 'no-store');
    await store.audit(account.id, 'login', { username: account.username });
    return { user: userPublic(account) };
  });
  app.get('/api/auth/me', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor','viewer']);
    if (!account) return;
    reply.header('Cache-Control', 'no-store');
    return { user: userPublic(account) };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const raw = readCookie(request, cookieName(cookieSecure));
    if (raw) await store.deleteSession(tokenHash(raw));
    reply.header('Set-Cookie', cookieHeader('', cookieSecure, 0));
    reply.header('Cache-Control', 'no-store');
    return { status: 'ok' };
  });
  app.get('/api/editor/pages', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor','viewer']);
    if (!account) return;
    reply.header('Cache-Control','no-store');
    return { pages: await store.listPages() };
  });
  app.patch<{ Params: { id: string }; Body: PublicContent & { expectedRevision: number } }>('/api/editor/pages/:id', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin','editor']);
    if (!account) return;
    const { id } = request.params; const body = request.body;
    if (!ID.test(id) || !body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1
      || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 140
      || typeof body.body !== 'string' || body.body.length > 100_000)
      return reply.code(400).send({ error: 'Проверьте название, содержимое и версию страницы' });
    const page = await store.updateDraft(id, body.expectedRevision, { title: body.title.trim(), body: body.body }, account.id);
    if (!page) return reply.code(409).send({ error: 'Страница была изменена. Обновите данные перед повторной правкой' });
    await store.audit(account.id, 'page.update', { pageId: id, revision: page.revision });
    reply.header('Cache-Control', 'no-store');
    return { page };
  });
  app.post<{ Params: { id: string }; Body: { expectedRevision: number } }>('/api/editor/pages/:id/publish', async (request, reply) => {
    const account = await requireRole(request, reply, ['admin']);
    if (!account) return;
    const { id } = request.params; const body = request.body;
    if (!ID.test(id) || !body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 1)
      return reply.code(400).send({ error: 'Некорректная версия публикации' });
    const page = await store.publish(id, body.expectedRevision, account.id);
    if (!page) return reply.code(409).send({ error: 'Страница изменилась. Обновите данные' });
    await store.audit(account.id, 'page.publish', { pageId: id, revision: page.revision });
    return { page };
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) return reply.code(error.statusCode).send({ error: error.message });
    request.log.error({ error }, 'server error');
    return reply.code(500).send({ error: 'Внутренняя ошибка. Обратитесь к администратору' });
  });
  return app;
}
