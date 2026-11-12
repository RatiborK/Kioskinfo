// apps/api/src/posters.test.ts — folder import is deterministic and safe under invalid input.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FolderPosterRepository } from './posters.js';

// One tiny transparent PNG; tests verify catalog and byte signatures, not image content rendering.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXjoAAAAASUVORK5CYII=', 'base64');
test('folder changes appear without reboot; invalid files are ignored', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'navikultura-posters-'));
  try {
    const posters = new FolderPosterRepository(dir);
    assert.deepEqual(await posters.list(), { posters: [], ignored: 0 });
    await writeFile(join(dir, 'Первый-концерт.png'), png);
    await writeFile(join(dir, 'ошибка.png'), 'not-an-image');
    let list = await posters.list();
    assert.equal(list.posters.length, 1);
    assert.equal(list.ignored, 1);
    assert.equal(list.posters[0].title, 'Первый концерт');
    assert.equal(list.posters[0].mime, 'image/png');
    await rm(join(dir, 'Первый-концерт.png'));
    list = await posters.list();
    assert.equal(list.posters.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('uploads are atomic and can be deleted; traversal and fake images are rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'navikultura-posters-'));
  try {
    const posters = new FolderPosterRepository(dir);
    const item = await posters.upload('Мастер-класс.png', png.toString('base64'));
    assert.match(item.name, /^Мастер-класс-[a-f0-9]{8}\.png$/);
    assert.equal((await posters.list()).posters.length, 1);
    assert.equal((await posters.media(item.name))?.mime, 'image/png');
    await assert.rejects(() => posters.upload('../something.png', png.toString('base64')), /INVALID_FILENAME/);
    await assert.rejects(() => posters.upload('bad.png', Buffer.from('invalid').toString('base64')), /INVALID_MEDIA/);
    await assert.rejects(() => posters.upload('video.mp4', png.toString('base64')), /UPLOAD_IMAGE_ONLY/);
    assert.equal(await posters.remove('../something.png'), false);
    assert.equal(await posters.remove(item.name), true);
    assert.equal(await posters.remove(item.name), false);
    assert.deepEqual((await posters.list()).posters, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('direct folder MP4 appears in the catalog (browser playback depends on codec)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'navikultura-posters-'));
  try {
    const posters = new FolderPosterRepository(dir);
    const header = Buffer.alloc(32);header.writeUInt32BE(32,0);header.write('ftyp',4,'ascii');
    await writeFile(join(dir, 'анонс.mp4'),header);
    const list = await posters.list();
    assert.equal(list.posters[0].kind,'video');
    assert.equal(list.posters[0].mime,'video/mp4');
  } finally { await rm(dir, { recursive:true, force:true }); }
});
