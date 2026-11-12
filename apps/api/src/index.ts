// apps/api/src/index.ts — loopback by default; LAN exposure only behind configured HTTPS reverse proxy.
import { createApp } from './app.js';
import { makePool, PgStore } from './store-pg.js';
import { FolderPosterRepository } from './posters.js';
import { PgScheduleRepository } from './schedule-pg.js';
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '3100');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT должен быть от 1 до 65535');
// Never run an unauthenticated API on a public interface. Reverse proxy handles LAN HTTPS.
if (host !== '127.0.0.1' && host !== '::1') throw new Error('API должен слушать loopback — настройте HTTPS reverse proxy для LAN');
const pool = makePool();
const app = createApp({ store: new PgStore(pool), posters: new FolderPosterRepository(), schedule: new PgScheduleRepository(pool), cookieSecure: process.env.COOKIE_SECURE === 'true', allowedOrigin: process.env.EDITOR_ORIGIN });
try {
  await pool.query('SELECT 1');
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
  await app.close();
  await pool.end();
}
const shutdown = async () => { await app.close(); await pool.end(); };
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
