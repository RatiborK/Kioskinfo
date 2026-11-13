// desktop/main.cjs — self-contained Windows kiosk: bundled web + Fastify + local storage.
'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { DesktopStore } = require('./lib/store.cjs');

const smoke = process.argv.includes('--smoke-test');
let window = null;
let server = null;
let origin = '';
let store = null;
let hashPassword = null;
let dataDir = '';

app.setName('НавиКультура');
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
});
app.on('window-all-closed', () => app.quit());

function apiModule(file) {
  return import(pathToFileURL(path.join(__dirname, 'bundled', 'api', file)).href);
}
async function startServer(dir) {
  const { createApp } = await apiModule('app.js');
  const { hashPassword: hash } = await apiModule('crypto.js');
  const { FileScheduleRepository } = await apiModule('schedule-file.js');
  const { seedPreviewSchedule } = await apiModule('seed-preview-schedule.js');
  const { FileThemeRepository } = await apiModule('themes.js');
  const { FileEventsRepository } = await apiModule('events.js');
  const { FolderDocumentsRepository } = await apiModule('documents.js');
  const { FolderPosterRepository } = await apiModule('posters.js');
  const { FileCultureRepository, CultureMedia, CultureVideos } = await apiModule('culture.js');

  const state = await DesktopStore.open(path.join(dir, 'state'));
  const schedule = new FileScheduleRepository(path.join(dir, 'schedule', 'records.json'));
  await seedPreviewSchedule(schedule, path.join(dir, 'schedule', 'starter-05-4.done'));
  const webRoot = path.join(__dirname, 'bundled', 'web');
  const webIndex = path.join(webRoot, 'index.html');
  await fs.access(webIndex);
  let currentOrigin = '';
  const fastify = createApp({
    store: state,
    posters: new FolderPosterRepository(path.join(dir, 'posters')),
    schedule,
    themes: new FileThemeRepository(path.join(dir, 'settings', 'visitor-theme.json')),
    events: new FileEventsRepository(path.join(dir, 'events', 'events.json')),
    documents: new FolderDocumentsRepository(path.join(dir, 'documents')),
    culture: new FileCultureRepository(path.join(dir, 'culture', 'catalog.json')),
    cultureMedia: new CultureMedia(path.join(dir, 'culture', 'images')),
    videos: new CultureVideos(path.join(dir, 'culture', 'videos')),
    cookieSecure: false,
    allowedOrigin: () => currentOrigin,
  });
  try {
    // Serves only immutable packaged files, never the mutable user-data directory.
    await fastify.register(require('@fastify/static'), {
      root: webRoot, prefix: '/', wildcard: true,
      etag: true, maxAge: '1h',
    });
    fastify.get('/screen', async (_req, reply) => {
      reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8');
      return reply.send(createReadStream(webIndex));
    });
    fastify.get('/editor', async (_req, reply) => {
      reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8');
      return reply.send(createReadStream(webIndex));
    });
    const url = await fastify.listen({ host: '127.0.0.1', port: 0 });
    currentOrigin = url.replace(/\/$/, '');
    return { fastify, url: currentOrigin, state, hash };
  } catch (error) {
    await fastify.close().catch(() => {});
    throw error;
  }
}
function trustedFrame(event, setup = false) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
    return false;
  const url = event.senderFrame.url;
  const setupUrl = pathToFileURL(path.join(__dirname, 'first-run.html')).href;
  return setup ? url === setupUrl : url.startsWith(origin + '/');
}
function launchKeyboard() {
  return new Promise(resolve => {
    const windowsDir = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    const child = spawn(path.join(windowsDir, 'System32', 'osk.exe'), [], {
      detached: true, stdio: 'ignore', windowsHide: false,
    });
    child.once('error', () => resolve({ ok: false, message: 'Windows не запустила экранную клавиатуру' }));
    child.once('spawn', () => { child.unref(); resolve({ ok: true, message: 'Клавиатура Windows вызвана' }); });
  });
}
function installIpc() {
  ipcMain.handle('navikultura:keyboard', event => {
    if (!trustedFrame(event)) throw Error('Запрос не из окна НавиКультуры');
    if (process.platform !== 'win32') throw Error('Клавиатура доступна только в Windows');
    return launchKeyboard();
  });
  ipcMain.handle('navikultura:setup', async (event, password) => {
    if (!trustedFrame(event, true) || store.initialized)
      return { ok: false, message: 'Настройка недоступна' };
    try {
      await store.initializeAdmin(password, hashPassword);
      setImmediate(() => { if (window && !window.isDestroyed()) void window.loadURL(origin + '/screen'); });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Ошибка сохранения' };
    }
  });
}
function openWindow() {
  window = new BrowserWindow({
    title: 'НавиКультура — ДК «Кировский»', show: false, backgroundColor: '#2c3e50',
    fullscreen: true, kiosk: true, frame: false, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    const firstRun = pathToFileURL(path.join(__dirname, 'first-run.html')).href;
    if (target !== firstRun && !target.startsWith(origin + '/')) event.preventDefault();
  });
  window.webContents.on('before-input-event', (event, input) => {
    // Emergency exit is explicit; this is not a substitute for Windows Assigned Access.
    if (input.type === 'keyDown' && input.control && input.shift &&
        input.key.toLowerCase() === 'q') {
      event.preventDefault();
      const answer = dialog.showMessageBoxSync(window, {
        type: 'question', title: 'Закрыть НавиКультуру?',
        message: 'Закрыть приложение на этом компьютере?',
        buttons: ['Отмена', 'Закрыть'], defaultId: 0, cancelId: 0,
      });
      if (answer === 1) app.quit();
    }
  });
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { window = null; });
  if (store.initialized) void window.loadURL(origin + '/screen');
  else void window.loadFile(path.join(__dirname, 'first-run.html'));
}
async function run() {
  dataDir = smoke
    ? await fs.mkdtemp(path.join(os.tmpdir(), 'navikultura-smoke-'))
    : path.join(app.getPath('userData'), 'data');
  try {
    const result = await startServer(dataDir);
    server = result.fastify; origin = result.url;
    store = result.state; hashPassword = result.hash;
    if (smoke) {
      const [health, page, asset] = await Promise.all([
        fetch(origin + '/api/health'), fetch(origin + '/screen'),
        fetch(origin + '/brand/dk-kirovsky-symbol.svg'),
      ]);
      if (!health.ok || !page.ok || !asset.ok ||
          !(await page.text()).includes('НавиКультура'))
        throw new Error('Smoke: API, SPA or static assets failed');
      process.stdout.write('NAVIKULTURA_PORTABLE_SMOKE_PASS\n');
      await server.close(); server = null;
      await fs.rm(dataDir, { recursive: true, force: true });
      app.exit(0);
      return;
    }
    installIpc();
    openWindow();
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    if (smoke) {
      process.stderr.write('NAVIKULTURA_PORTABLE_SMOKE_FAIL: ' + message + '\n');
      await server?.close().catch(() => {});
      await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
      app.exit(1);
    } else {
      dialog.showErrorBox('Ошибка запуска НавиКультуры', message);
      app.quit();
    }
  }
}
app.whenReady().then(run);
app.on('before-quit', () => { if (server) void server.close().catch(() => {}); });
