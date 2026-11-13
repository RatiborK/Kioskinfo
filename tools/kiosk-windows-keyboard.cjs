// tools/kiosk-windows-keyboard.cjs — loopback-only Windows OSK bridge for the physical visitor PC.
// Never deploy this helper on the central API server: it launches OSK in the local session.
'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = 48765;
const DEV_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173'];

function allowedOrigins(environment = process.env) {
  const result = new Set(DEV_ORIGINS);
  for (const entry of (environment.NAVIKULTURA_KIOSK_ORIGIN || '').split(',')) {
    const source = entry.trim();
    if (!source) continue;
    const url = new URL(source);
    if (url.origin !== source || url.username || url.password ||
      (url.protocol !== 'https:' &&
       !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('NAVIKULTURA_KIOSK_ORIGIN must contain exact HTTPS origins (or local dev origins)');
    }
    result.add(source);
  }
  return result;
}

function launchWindowsKeyboard() {
  return new Promise((resolve) => {
    // Fixed Windows executable and zero arguments; the browser cannot supply a command.
    const windowsDirectory = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    let child;
    try {
      child = spawn(path.join(windowsDirectory, 'System32', 'osk.exe'), [], {
        detached: true, stdio: 'ignore', windowsHide: false,
      });
    } catch {
      resolve(false);
      return;
    }
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

function createKeyboardServer({
  origins = allowedOrigins(),
  platform = process.platform,
  launch = launchWindowsKeyboard,
} = {}) {
  let launching = false;
  let lastLaunch = 0;
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const response = (code, message) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: code === 200, message }));
    };

    const socket = server.address();
    const port = socket && typeof socket === 'object' ? socket.port : PORT;
    const expectedHosts = new Set([`${HOST}:${port}`, `localhost:${port}`]);
    if (!expectedHosts.has(req.headers.host || '')) {
      response(403, 'invalid-host');
      return;
    }
    const origin = req.headers.origin || '';
    if (!origins.has(origin)) {
      response(403, 'origin-not-allowed');
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.url !== '/keyboard') {
      response(404, 'not-found');
      return;
    }
    if (req.method === 'OPTIONS') {
      if (req.headers['access-control-request-method'] !== 'POST') {
        response(405, 'method-not-allowed');
        return;
      }
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'X-Navikultura-Keyboard');
      res.setHeader('Access-Control-Max-Age', '600');
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== 'POST' || req.headers['x-navikultura-keyboard'] !== 'show') {
      response(405, 'explicit-action-required');
      return;
    }
    if (platform !== 'win32') {
      response(501, 'windows-only');
      return;
    }
    if (launching) {
      response(503, 'keyboard-launch-in-progress');
      return;
    }
    if (Date.now() - lastLaunch < 1200) {
      response(200, 'keyboard-already-requested');
      return;
    }
    launching = true;
    Promise.resolve().then(launch).then((opened) => {
      launching = false;
      if (opened) lastLaunch = Date.now();
      response(opened ? 200 : 503, opened ? 'keyboard-started' : 'keyboard-launch-failed');
    }).catch(() => {
      launching = false;
      response(503, 'keyboard-launch-failed');
    });
  });
  return server;
}

if (require.main === module) {
  const server = createKeyboardServer();
  server.on('error', (error) => {
    console.error('Windows keyboard bridge failed:', error.message);
    process.exitCode = 1;
  });
  server.listen(PORT, HOST, () => {
    console.log(`Windows keyboard bridge listening on http://${HOST}:${PORT}`);
    console.log('Allowed origins:', [...allowedOrigins()].join(', '));
  });
}

module.exports = { allowedOrigins, createKeyboardServer, launchWindowsKeyboard };
