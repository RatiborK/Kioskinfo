// tools/kiosk-windows-keyboard.test.cjs — no GUI or Windows dependencies required.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { allowedOrigins, createKeyboardServer } = require('./kiosk-windows-keyboard.cjs');

async function withServer(options, run) {
  const server = createKeyboardServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(server); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
function request(server, { method = 'POST', origin = 'http://127.0.0.1:5173',
  path = '/keyboard', action = 'show', headers = {} } = {}) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, method, path,
      headers: {
        Origin: origin,
        ...(action === null ? {} : { 'X-Navikultura-Keyboard': action }),
        ...headers,
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('only exact HTTPS production origins (and localhost development) are accepted', () => {
  const origins = allowedOrigins({ NAVIKULTURA_KIOSK_ORIGIN: 'https://navikultura.local,https://example.org:8443' });
  assert.equal(origins.has('https://navikultura.local'), true);
  assert.equal(origins.has('https://example.org:8443'), true);
  assert.equal(origins.has('https://navikultura.local.attacker.test'), false);
  assert.throws(() => allowedOrigins({ NAVIKULTURA_KIOSK_ORIGIN: 'http://example.org' }));
  assert.throws(() => allowedOrigins({ NAVIKULTURA_KIOSK_ORIGIN: 'https://example.org/screen' }));
  assert.throws(() => allowedOrigins({ NAVIKULTURA_KIOSK_ORIGIN: '*' }));
});

test('foreign Origin and rebinding Host never trigger OSK', async () => {
  let launches = 0;
  await withServer({ platform: 'win32', launch: async () => { launches++; return true; } }, async (server) => {
    assert.equal((await request(server, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await request(server, { headers: { Host: 'evil.example:48765' } })).status, 403);
    assert.equal((await request(server, { path: '/launch?command=calc.exe' })).status, 404);
    assert.equal(launches, 0);
  });
});

test('explicit action header is mandatory; preflight has no execution side effects', async () => {
  let launches = 0;
  await withServer({ platform: 'win32', launch: async () => { launches++; return true; } }, async (server) => {
    assert.equal((await request(server, { action: null })).status, 405);
    assert.equal((await request(server, { method: 'GET' })).status, 405);
    const preflight = await request(server, {
      method: 'OPTIONS', action: null, headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-navikultura-keyboard',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'http://127.0.0.1:5173');
    assert.equal(launches, 0);
  });
});

test('authorized user action launches OSK on Windows with debounce', async () => {
  let launches = 0;
  await withServer({ platform: 'win32', launch: async () => { launches++; return true; } }, async (server) => {
    const first = await request(server);
    assert.equal(first.status, 200);
    assert.equal(JSON.parse(first.body).message, 'keyboard-started');
    assert.equal((await request(server)).status, 200);
    assert.equal(launches, 1);
  });
});

test('non-Windows platform rejects execution', async () => {
  let launches = 0;
  await withServer({ platform: 'linux', launch: async () => { launches++; return true; } }, async (server) => {
    assert.equal((await request(server)).status, 501);
    assert.equal(launches, 0);
  });
});

test('native process launch failure is reported rather than claimed successful', async () => {
  await withServer({ platform: 'win32', launch: async () => false }, async (server) => {
    assert.equal((await request(server)).status, 503);
  });
});
