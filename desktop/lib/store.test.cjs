// desktop/lib/store.test.cjs — no password baked into portable builds, persist single-PC edits.
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { DesktopStore } = require('./store.cjs');

test('first run requires a deliberate password and stores only its hash', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navikultura-desktop-store-'));
  try {
    const store = await DesktopStore.open(dir);
    assert.equal(store.initialized, false);
    await assert.rejects(() => store.initializeAdmin('12345678', async x => x));
    await store.initializeAdmin('correct-long-password', async value => {
      assert.equal(value, 'correct-long-password');
      return 'scrypt$unit-test-only';
    });
    assert.equal(store.initialized, true);
    const raw = await fs.readFile(path.join(dir, 'admin.json'), 'utf8');
    assert.equal(raw.includes('correct-long-password'), false);
    assert.equal((await DesktopStore.open(dir)).initialized, true);
    await assert.rejects(() => store.initializeAdmin('another-long-password', async x => x));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('pages persist after restart with revision conflict protection', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navikultura-desktop-pages-'));
  try {
    const store = await DesktopStore.open(dir);
    const [original] = await store.listPages();
    const updated = await store.updateDraft(original.id, 1, { title: 'Редактируем', body: 'Тест' });
    assert.equal(updated.revision, 2);
    assert.equal((await store.getPublishedBySlug('welcome')).title, 'ДК «Кировский»');
    assert.equal(await store.publish(original.id, 1), null);
    assert.equal((await store.publish(original.id, 2)).published.title, 'Редактируем');
    const restarted = await DesktopStore.open(dir);
    assert.equal((await restarted.getPublishedBySlug('welcome')).title, 'Редактируем');
    assert.equal(await restarted.updateDraft(original.id, 1, { title: 'Старое', body: 'X' }), null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('corrupt account never silently resets to a new admin setup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'navikultura-desktop-corrupt-'));
  try {
    await fs.writeFile(path.join(dir, 'admin.json'), '{broken');
    await assert.rejects(() => DesktopStore.open(dir), /Не удалось прочитать данные/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
