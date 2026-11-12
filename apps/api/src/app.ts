// apps/api/src/app.ts — read-only API foundation. No public editing endpoints until auth is ready.
import Fastify from 'fastify';

export function createApp() {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({ status: 'ok', service: 'navikultura-api', phase: 'stage-00' }));

  app.get('/api/public/navigation', async () => ({
    status: 'demo',
    sections: [
      { id: 'posters', title: 'Афиша' },
      { id: 'schedule', title: 'Расписание' },
      { id: 'groups', title: 'Коллективы' },
      { id: 'navigation', title: 'Навигация' },
      { id: 'about', title: 'О ДК' },
      { id: 'contacts', title: 'Контакты' },
    ],
  }));
  return app;
}
