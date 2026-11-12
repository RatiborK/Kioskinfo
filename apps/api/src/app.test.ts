// apps/api/src/app.test.ts — smoke-tests without binding a network port.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';

test('API health endpoint is stable', async () => {
  const app = createApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: 'ok', service: 'navikultura-api', phase: 'stage-00',
    });
  } finally {
    await app.close();
  }
});

test('public navigation is explicitly demo data', async () => {
  const app = createApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/api/public/navigation' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'demo');
    assert.equal(response.json().sections.length, 6);
  } finally {
    await app.close();
  }
});

test('unimplemented write API is unavailable', async () => {
  const app = createApp();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/editor/save', payload: {} });
    assert.equal(response.statusCode, 404);
  } finally {
    await app.close();
  }
});
